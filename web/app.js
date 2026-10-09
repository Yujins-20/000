const $ = id => document.getElementById(id);
const DIR = {front:'정면', right:'오른쪽', back:'뒤쪽', left:'왼쪽'};
const state = {pos:null, heading:null, spoken:new Set(), watching:false,
  history:[], focus:null, abort:null, lastTalk:0};

const setStatus = t => { $('status').textContent = t; };
const payload = (extra = {}) => ({lat:state.pos.lat, lng:state.pos.lng, heading:state.heading,
  radius_m:+$('radius').value, lang:$('lang').value, persona:$('persona').value, depth:$('depth').value, ...extra});

async function post(url, body, signal){
  const r = await fetch(url, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body), signal});
  if(!r.ok) throw new Error(r.status);
  return r;
}

// ---------- 대화 UI ----------
function bubble(cls, text = ''){
  const d = document.createElement('div'); d.className = 'b ' + cls; d.textContent = text;
  const chat = $('chat'); if(chat.querySelector('.b.s')?.textContent === '아직 안내가 없습니다.') chat.innerHTML = '';
  chat.appendChild(d); d.scrollIntoView({block:'nearest', behavior:'smooth'}); return d;
}
function chips(list){
  $('chips').innerHTML = '';
  (list || []).forEach(t => { const b = document.createElement('button'); b.className = 'sec'; b.textContent = t;
    b.onclick = () => ask(t); $('chips').appendChild(b); });
}

// ---------- 질문 → 스트리밍 응답 ----------
// 문장이 완성되는 즉시 화면에 붙이고 TTS 큐에 넣는다. 후속 질문에는 history/focus 를 함께 보낸다.
async function ask(question, {placeId = null, auto = false} = {}){
  if(!state.pos){ setStatus('아직 위치를 못 잡았어요.'); return; }
  state.abort && state.abort.abort();                     // 진행 중인 답변은 끊고 새 질문 처리
  const ctl = state.abort = new AbortController();
  state.lastTalk = Date.now();
  const q = question.trim();
  bubble(auto ? 's' : 'u', auto ? `🔔 ${q}` : q);
  const out = bubble('g live');
  chips([]);
  Voice.start({persona:$('persona').value, lang:$('lang').value});
  let full = '', meta = null;
  const body = payload({question: q, place_id: placeId, history: state.history.slice(-8), focus: state.focus});
  try{
    const r = await post('/api/ask/stream', body, ctl.signal);
    const reader = r.body.getReader(), dec = new TextDecoder(); let buf = '';
    for(;;){
      const {value, done} = await reader.read(); if(done) break;
      buf += dec.decode(value, {stream:true});
      let i; while((i = buf.indexOf('\n\n')) >= 0){
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if(!line.startsWith('data: ')) continue;
        const ev = JSON.parse(line.slice(6));
        if(ev.type === 'meta') meta = ev;
        else if(ev.type === 'sentence'){ full += (full ? ' ' : '') + ev.text; out.textContent = full; Voice.push(ev.text); }
        else if(ev.type === 'error') bubble('s', '⚠️ 해설 생성 중 오류가 났어요. 다시 물어봐 주세요.');
      }
    }
  }catch(e){
    if(e.name !== 'AbortError') setStatus('오류: ' + e.message);
  }finally{
    out.classList.remove('live'); Voice.end();
  }
  if(ctl.signal.aborted || !full) return;
  // 새 이야기면 맥락을 새로 시작하고, 후속 질문이면 이어 붙인다.
  const turn = [{role:'user', content: q || '이 장소를 이야기해줘'}, {role:'assistant', content: full}];
  state.history = meta?.mode === 'followup' ? state.history.concat(turn) : turn;
  if(meta?.place) state.focus = meta.place;
  chips(meta?.follow_ups);
}

// ---------- 주변 탐색 / 자동 안내 ----------
async function refreshNearby(){
  if(!state.pos) return;
  try{
    const ps = await (await post('/api/nearby', payload())).json();
    $('list').innerHTML = ps.map(p=>`<li>${DIR[p.direction]} ${p.distance_m}m · ${p.name}</li>`).join('') || '<li>없음</li>';
    // 대화 중(15초 이내)이거나 말하는 중에는 끼어들지 않는다
    const fresh = ps.find(p => p.distance_m < 80 && !state.spoken.has(p.id));
    if(fresh && !Voice.speaking() && Date.now() - state.lastTalk > 15000){
      state.spoken.add(fresh.id);
      ask(`${DIR[fresh.direction]}에 있는 ${fresh.name} 이야기`, {placeId: fresh.id, auto: true});
    }
  }catch(e){ setStatus('오류: ' + e.message); }
}

function onOrientation(e){
  // iOS: webkitCompassHeading(북 기준), Android: alpha(반시계) → 변환
  if(typeof e.webkitCompassHeading === 'number') state.heading = e.webkitCompassHeading;
  else if(e.alpha != null) state.heading = (360 - e.alpha) % 360;
}

async function start(){
  if(typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission){
    try{ await DeviceOrientationEvent.requestPermission(); }catch{}
  }
  addEventListener('deviceorientationabsolute', onOrientation, true);
  addEventListener('deviceorientation', onOrientation, true);
  navigator.geolocation.watchPosition(p=>{
    state.pos = {lat:p.coords.latitude, lng:p.coords.longitude};
    if(p.coords.heading != null && !isNaN(p.coords.heading) && p.coords.speed > 0.7) state.heading = p.coords.heading;
    setStatus(`위치 ${state.pos.lat.toFixed(5)}, ${state.pos.lng.toFixed(5)} · 방향 ${state.heading==null?'알 수 없음':Math.round(state.heading)+'°'}`);
  }, e=>setStatus('위치 오류: '+e.message), {enableHighAccuracy:true, maximumAge:2000});
  if(!state.watching){ state.watching = true; setInterval(refreshNearby, 8000); }
  Voice.say('안내를 시작합니다.', {lang:$('lang').value});
}

// ---------- 카메라 모드 ----------
function shrink(file, max = 1024){
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = img.width*k; c.height = img.height*k;
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      res(c.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = rej; img.src = URL.createObjectURL(file);
  });
}
async function look(file){
  if(!state.pos){ setStatus('아직 위치를 못 잡았어요.'); return; }
  const q = $('q').value.trim();
  bubble('u', '📷 ' + (q || '지금 보이는 이게 뭐야?'));
  const out = bubble('g live', '사진을 보고 있어요…');
  try{
    const a = await (await post('/api/look', payload({image: await shrink(file), question: q}))).json();
    out.textContent = a.text; out.classList.remove('live');
    Voice.say(a.text, {persona:$('persona').value, lang:$('lang').value});
    state.history = [{role:'user', content: q || '(사진) 지금 보이는 이게 뭐야?'}, {role:'assistant', content: a.text}];
  }catch(e){
    out.classList.remove('live');
    out.textContent = e.message === '503' ? '서버에 VLM이 설정되지 않았어요.' : '사진 분석 오류: ' + e.message;
  }
}

function listen(){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SR){ setStatus('이 브라우저는 음성 인식을 지원하지 않아요. 입력창을 쓰세요.'); return; }
  Voice.stop();                                           // 말하는 도중에도 끊고 질문할 수 있게
  const r = new SR();
  r.lang = $('lang').value === 'en' ? 'en-US' : 'ko-KR';
  r.onresult = e => ask(e.results[0][0].transcript);
  r.onerror = e => setStatus('음성 인식 오류: ' + e.error);
  r.start();
}

$('start').onclick = start;
$('mic').onclick = listen;
$('stop').onclick = () => { state.abort && state.abort.abort(); Voice.stop(); };
$('cam').onchange = e => e.target.files[0] && look(e.target.files[0]);
const send = () => { const v = $('q').value.trim(); if(v){ $('q').value = ''; ask(v); } };
$('send').onclick = send;
$('q').addEventListener('keydown', e => { if(e.key === 'Enter') send(); });
if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
