const $ = id => document.getElementById(id);
const DIR = {front:'정면', right:'오른쪽', back:'뒤쪽', left:'왼쪽'};
const API_BASE = (window.WALKGUIDE_API_BASE || '').replace(/\/+$/, '');   // 같은 출처(웹)면 ''
const APP_VERSION = window.WALKGUIDE_APP_VERSION || 'web';                 // 네이티브 빌드에서만 숫자 버전
Voice.setBase(API_BASE);

const state = {pos:null, spoken:new Set(), started:false, history:[], focus:null, abort:null, lastTalk:0, lastNearby:0, updateRequired:false};
const store = {get:k => { try { return localStorage.getItem(k) || ''; } catch { return ''; } },
               set:(k, v) => { try { localStorage.setItem(k, v); } catch {} }};

const setStatus = t => { $('status').textContent = t; };
function banner(msg, kind = 'error'){ const b = $('banner'); b.textContent = msg; b.className = kind === 'info' ? 'info' : ''; b.style.display = msg ? 'block' : 'none'; }
$('ver').textContent = APP_VERSION === 'web' ? '웹' : 'v' + APP_VERSION;

// 설정 기억
['lang', 'persona', 'depth', 'radius'].forEach(id => {
  const v = store.get('wg_' + id); if(v && [...$(id).options].some(o => o.value === v)) $(id).value = v;
  $(id).addEventListener('change', () => store.set('wg_' + id, $(id).value));
});

const payload = (extra = {}) => ({lat:state.pos.lat, lng:state.pos.lng, heading:Native.heading().deg,
  radius_m:+$('radius').value, lang:$('lang').value, persona:$('persona').value, depth:$('depth').value, ...extra});

async function post(url, body, signal){
  const r = await fetch(API_BASE + url, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body), signal});
  if(!r.ok) throw new Error(r.status);
  return r;
}
// 앱이 백그라운드일 때 TTS 는 네이티브 HTTP 로 받는다(Android WebView 는 오래된 백그라운드에서 네트워크를 제한)
Voice.setFetcher(async (text, persona) => Native.useNativeHttp() ? Native.nativePostAudio(API_BASE + '/api/tts', {text, persona}) : null);

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

// ---------- 신고 (AI 생성 콘텐츠: 스토어 정책상 앱 안에서 신고할 수 있어야 한다) ----------
let reporting = null;
function reportButton(item){
  const b = document.createElement('button'); b.className = 'rp'; b.textContent = '🚩 신고·오류 알리기';
  b.onclick = () => { reporting = item; $('reportComment').value = ''; $('report').showModal(); };
  $('chat').appendChild(b);
}
$('reportCancel').onclick = () => $('report').close();
$('reportSend').onclick = async () => {
  const it = reporting; $('report').close(); if(!it) return;
  try{
    await post('/api/feedback', {kind:$('reportKind').value, question:it.question, answer:it.answer, place_id:it.placeId,
      comment:$('reportComment').value, persona:$('persona').value, lang:$('lang').value, app_version:APP_VERSION});
    bubble('s', '🙏 신고가 접수됐어요. 고맙습니다.');
  }catch(e){ bubble('s', '신고를 보내지 못했어요. 잠시 후 다시 시도해 주세요.'); }
};

// ---------- 질문 → 응답 ----------
// 포그라운드: 스트리밍(SSE)으로 문장이 완성되는 즉시 표시·낭독. 백그라운드(네이티브): 네이티브 HTTP 로 일괄 응답.
async function ask(question, {placeId = null, auto = false} = {}){
  if(state.updateRequired) return;
  if(!state.pos){ setStatus('아직 위치를 못 잡았어요. 시작을 눌러 주세요.'); return; }
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
    if(Native.useNativeHttp()){
      const r = await Native.nativePostJson(API_BASE + '/api/ask', body);
      if(r.status !== 200) throw new Error(r.status);
      full = r.data.text; meta = {mode:r.data.mode, place:r.data.place, follow_ups:r.data.follow_ups};
      out.textContent = full; Voice.split(full).forEach(Voice.push);
    } else {
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
    }
  }catch(e){
    if(e.name !== 'AbortError'){   // 상태줄은 위치 갱신이 덮어쓰므로 대화창에도 남긴다
      const msg = e.message === '429' ? '⏳ 요청이 너무 많아요. 잠시 후 다시 물어봐 주세요.'
        : (navigator.onLine === false ? '📡 인터넷에 연결되어 있지 않아요.' : '⚠️ 서버 오류(' + e.message + '). 잠시 후 다시 시도해 주세요.');
      out.remove(); bubble('s', msg); setStatus(msg);
    }
  }finally{
    out.classList.remove('live'); Voice.end();
  }
  if(ctl.signal.aborted || !full) return;
  // 새 이야기면 맥락을 새로 시작하고, 후속 질문이면 이어 붙인다.
  const turn = [{role:'user', content: q || '이 장소를 이야기해줘'}, {role:'assistant', content: full}];
  state.history = meta?.mode === 'followup' ? state.history.concat(turn) : turn;
  if(meta?.place) state.focus = meta.place;
  chips(meta?.follow_ups);
  reportButton({question:q, answer:full, placeId: meta?.place?.id || null});
}

// ---------- 주변 탐색 / 자동 안내 ----------
async function refreshNearby(){
  if(!state.pos || state.updateRequired) return;
  state.lastNearby = Date.now();
  try{
    let ps;
    if(Native.useNativeHttp()) ps = (await Native.nativePostJson(API_BASE + '/api/nearby', payload())).data;
    else ps = await (await post('/api/nearby', payload())).json();
    $('list').innerHTML = ps.map(p=>`<li>${DIR[p.direction]} ${p.distance_m}m · ${p.name}</li>`).join('') || '<li>없음</li>';
    // 대화 중(15초 이내)이거나 말하는 중에는 끼어들지 않는다
    const fresh = ps.find(p => p.distance_m < 80 && !state.spoken.has(p.id));
    if(fresh && !Voice.speaking() && Date.now() - state.lastTalk > 15000){
      state.spoken.add(fresh.id);
      ask(`${DIR[fresh.direction]}에 있는 ${fresh.name} 이야기`, {placeId: fresh.id, auto: true});
    }
  }catch(e){ setStatus('오류: ' + e.message); }
}

// ---------- 위치 / 시작·종료 ----------
function onLocation(loc){
  state.pos = {lat:loc.lat, lng:loc.lng};
  const h = Native.heading();
  const src = {compass:'나침반', course:'걷는 방향 기준', none:'알 수 없음'}[h.source];
  setStatus(`위치 ${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)} · 방향 ${h.deg == null ? '알 수 없음' : Math.round(h.deg) + '° (' + src + ')'}`);
  if(Date.now() - state.lastNearby > 8000) refreshNearby();   // 위치 갱신 때마다(백그라운드 포함) 주변 확인
}
function onLocationError(err){
  const denied = err.code === 'NOT_AUTHORIZED';
  setStatus(denied ? '위치 권한이 꺼져 있어요. 설정에서 위치를 "허용"해 주세요.' : '위치 오류: ' + err.message);
  $('openSettings').style.display = denied ? 'block' : 'none';
}
$('openSettings').onclick = () => Native.isNative ? Native.openSettings() : alert('브라우저 설정에서 이 사이트의 위치 권한을 허용해 주세요.');

async function startGuide(){
  if(state.updateRequired) return;
  await Native.startCompass();
  try{ await Native.startLocation({onLocation, onError:onLocationError}); }
  catch(e){ return onLocationError(e); }
  state.started = true; Native._wakeWanted = true; Native.keepAwake(true);
  Native.mediaSession({title:'워크가이드', onStop: () => { state.abort && state.abort.abort(); Voice.stop(); }});
  $('start').textContent = '■ 안내 종료';
  Voice.say('안내를 시작합니다.', {lang:$('lang').value});
}
function stopGuide(){
  Native.stopLocation(); Native._wakeWanted = false; Native.keepAwake(false);
  state.abort && state.abort.abort(); Voice.stop();
  state.started = false; $('start').textContent = '▶ 시작 (자동 안내 켜기)'; setStatus('안내를 종료했어요.');
}
$('start').onclick = () => {
  if(state.started) return stopGuide();
  if(store.get('wg_onboarded') === '1') startGuide(); else $('onboard').showModal();   // 최초 1회: 권한 사용 목적 안내·동의
};
$('onboardNo').onclick = () => $('onboard').close();
$('onboardYes').onclick = () => { store.set('wg_onboarded', '1'); $('onboard').close(); startGuide(); };

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
async function look(dataUrl){
  if(!state.pos){ setStatus('아직 위치를 못 잡았어요.'); return; }
  const q = $('q').value.trim();
  bubble('u', '📷 ' + (q || '지금 보이는 이게 뭐야?'));
  const out = bubble('g live', '사진을 보고 있어요…');
  try{
    const a = await (await post('/api/look', payload({image: dataUrl, question: q}))).json();
    out.textContent = a.text; out.classList.remove('live');
    Voice.say(a.text, {persona:$('persona').value, lang:$('lang').value});
    state.history = [{role:'user', content: q || '(사진) 지금 보이는 이게 뭐야?'}, {role:'assistant', content: a.text}];
    reportButton({question:q || '(사진)', answer:a.text, placeId:null});
  }catch(e){
    out.classList.remove('live');
    out.textContent = e.message === '503' ? '지금은 사진 분석을 쓸 수 없어요.' : e.message === '429' ? '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.' : '사진 분석 오류: ' + e.message;
  }
}
$('camLabel').addEventListener('click', async e => {
  if(!Native.isNative) return;                              // 웹: 기본 파일 입력 동작
  e.preventDefault();
  try{ const d = await Native.takePhoto(); if(d) look(d); }
  catch(err){ if(!/cancel/i.test(err.message || '')) setStatus('카메라를 열 수 없어요: ' + (err.message || err)); }
});
$('cam').onchange = async e => { const f = e.target.files[0]; if(f){ look(await shrink(f)); e.target.value = ''; } };

// ---------- 음성 질문 ----------
$('mic').onclick = async () => {
  Voice.stop();                                           // 말하는 도중에도 끊고 질문할 수 있게
  setStatus('🎤 듣고 있어요…');
  try{ const t = await Native.listen($('lang').value); if(t) ask(t); else setStatus('잘 못 들었어요. 다시 말씀해 주세요.'); }
  catch(e){
    setStatus(e.code === 'NOT_AUTHORIZED' ? '마이크 권한이 필요해요. 설정에서 허용해 주세요.'
      : e.code === 'UNSUPPORTED' ? '이 브라우저는 음성 인식을 지원하지 않아요. 입력창을 쓰세요.' : '음성 인식 오류: ' + e.message);
  }
};
$('stop').onclick = () => { state.abort && state.abort.abort(); Voice.stop(); };
const send = () => { const v = $('q').value.trim(); if(v){ $('q').value = ''; ask(v); } };
$('send').onclick = send;
$('q').addEventListener('keydown', e => { if(e.key === 'Enter') send(); });

// ---------- 서버 상태 / 강제 업데이트 ----------
async function checkServer(){
  try{
    const h = await (await fetch(API_BASE + '/api/health', {signal: AbortSignal.timeout(6000)})).json();
    if(APP_VERSION !== 'web' && h.min_app_version && Native.compareVersions(APP_VERSION, h.min_app_version) < 0){
      state.updateRequired = true; $('start').disabled = true;
      banner('새 버전으로 업데이트해야 사용할 수 있어요. 스토어에서 워크가이드를 업데이트해 주세요.');
    } else banner('');
  }catch{ banner(navigator.onLine === false ? '📡 인터넷에 연결되어 있지 않아요.' : '서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.', 'info'); }
}
checkServer();
addEventListener('online', checkServer);

if(!Native.isNative && 'serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(()=>{});
