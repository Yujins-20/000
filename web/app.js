const $ = id => document.getElementById(id);
const DIR = {front:'정면', right:'오른쪽', back:'뒤쪽', left:'왼쪽'};
const state = {pos:null, heading:null, spoken:new Set(), busy:false, watching:false};

function say(text){
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = $('lang').value === 'en' ? 'en-US' : 'ko-KR';
  speechSynthesis.speak(u);
}
function setStatus(t){ $('status').textContent = t; }

function payload(extra={}){
  return {lat:state.pos.lat, lng:state.pos.lng, heading:state.heading,
    radius_m:+$('radius').value, lang:$('lang').value, persona:$('persona').value, ...extra};
}
async function post(url, body){
  const r = await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!r.ok) throw new Error(r.status);
  return r.json();
}

async function ask(question, placeId=null){
  if(!state.pos){ setStatus('아직 위치를 못 잡았어요.'); return; }
  if(state.busy) return;
  state.busy = true;
  try{
    const a = await post('/api/ask', payload({question, place_id:placeId}));
    $('answer').textContent = a.text;
    say(a.text);
  }catch(e){ setStatus('오류: '+e.message); }
  finally{ state.busy = false; }
}

async function refreshNearby(){
  if(!state.pos) return;
  try{
    const ps = await post('/api/nearby', payload());
    $('list').innerHTML = ps.map(p=>`<li>${DIR[p.direction]} ${p.distance_m}m · ${p.name}</li>`).join('') || '<li>없음</li>';
    // 자동 안내: 처음 진입한 가까운(<80m) 장소를 먼저 말해줌
    const fresh = ps.find(p=>p.distance_m<80 && !state.spoken.has(p.id));
    if(fresh && !state.busy && !speechSynthesis.speaking){
      state.spoken.add(fresh.id);
      ask(`${DIR[fresh.direction]}에 있는 ${fresh.name} 설명해줘`, fresh.id);
    }
  }catch(e){ setStatus('오류: '+e.message); }
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
  say('안내를 시작합니다.');
}

function listen(){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SR){ setStatus('이 브라우저는 음성 인식을 지원하지 않아요. 입력창을 쓰세요.'); return; }
  const r = new SR();
  r.lang = $('lang').value === 'en' ? 'en-US' : 'ko-KR';
  r.onresult = e => { const t = e.results[0][0].transcript; $('q').value = t; ask(t); };
  r.onerror = e => setStatus('음성 인식 오류: '+e.error);
  r.start();
}

$('start').onclick = start;
$('mic').onclick = listen;
$('send').onclick = () => $('q').value && ask($('q').value);
if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
