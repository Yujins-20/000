// 앱 시뮬레이터 전용: ?sim=1 로 열었을 때만 index.html 이 불러온다. (앱 빌드에는 포함되지 않는다 — app/scripts/build-web.mjs 의 EXCLUDE)
// 실제 앱 코드(app.js/native.js/tts.js)는 그대로 두고, 아래 두 가지만 가짜로 대체한다.
//  1) 네이티브 플러그인(window.Capacitor): 백그라운드 위치, 음성 인식, 카메라, 네이티브 HTTP
//  2) 서버 API(/api/*): 미리 준비된 장소 데이터로 스트리밍 응답을 흉내 낸다 (AI 가 아님 — 데모 문장)
// 부모 창(app-sim.html)의 조작 패널과 postMessage 로 통신하고, 어떤 경로가 쓰였는지 로그로 알려 준다.
(function () {
  if (!/[?&]sim=1/.test(location.search)) return;
  const params = new URLSearchParams(location.search);
  const platform = params.get('platform') === 'ios' ? 'ios' : 'android';
  if (!window.WALKGUIDE_APP_VERSION) window.WALKGUIDE_APP_VERSION = '1.0.0';   // 네이티브 앱처럼 버전 표시·강제 업데이트 판단이 동작하게

/*SHARED-BEGIN*/
const SHARED = {
 "PERSONAS": {
  "historian": {
   "label": "역사학자"
  },
  "funny": {
   "label": "유머러스"
  },
  "kid": {
   "label": "아이용"
  },
  "storyteller": {
   "label": "이야기꾼"
  },
  "insider": {
   "label": "현지 고수"
  }
 },
 "FOLLOW_UPS": {
  "ko": [
   "누가, 왜 만들었어?",
   "재밌는 일화 하나만 더 들려줘",
   "여기서 뭘 눈여겨보면 좋아?",
   "주변에 또 볼 만한 곳은?",
   "그 뒤로 어떻게 변했어?",
   "사진 찍기 좋은 위치는?"
  ],
  "en": [
   "Who built it, and why?",
   "Tell me one more fun story",
   "What should I look at here?",
   "What else is nearby?",
   "How did it change over time?",
   "Where's the best photo spot?"
  ]
 },
 "PLACES": [
  {
   "id": "colosseum",
   "name": "콜로세움",
   "lat": 41.89021,
   "lng": 12.49223,
   "summary": "플라비우스 왕조의 베스파시아누스 황제 때인 서기 70년대 초에 공사를 시작해, 아들 티투스가 서기 80년에 개장한 로마 최대의 원형 경기장입니다. 정식 이름은 플라비우스 원형경기장이고, '콜로세움'이라는 이름은 근처에 있던 네로 황제의 거대한 동상(콜로소)에서 왔다는 설이 널리 받아들여집니다. 타원형 평면은 길이 약 190m, 높이는 약 50m에 이르고, 수용 인원은 추정이 갈리지만 5만 명 안팎으로 봅니다. 개장 기념 경기는 100일 동안 이어졌다고 전해집니다. 지하에는 맹수와 검투사가 대기하던 공간과 승강 장치가 있었고, 햇빛을 가리는 거대한 천막 지붕은 선원들이 조작했다고 알려져 있습니다. 중세에는 요새와 석재 채석장으로도 쓰였고, 지진과 약탈로 외벽 일부가 무너져 지금의 모습이 되었습니다."
  },
  {
   "id": "arch_constantine",
   "name": "콘스탄티누스 개선문",
   "lat": 41.88981,
   "lng": 12.49055,
   "summary": "서기 315년에 봉헌된, 로마에 남은 개선문 중 가장 큰 문입니다. 312년 밀비우스 다리 전투에서 콘스탄티누스 황제가 막센티우스를 이긴 것을 기념해 원로원이 세웠습니다. 높이는 약 21m이고 통로가 세 개입니다. 이 문의 흥미로운 점은 조각 상당수를 트라야누스·하드리아누스·마르쿠스 아우렐리우스 시대의 오래된 기념물에서 가져다 다시 썼다는 것입니다. 그래서 같은 문에 다른 시대의 조각 양식이 섞여 있습니다. 개선 행렬이 콜로세움 옆을 지나 포로 로마노로 향하던 길목에 서 있습니다."
  },
  {
   "id": "forum",
   "name": "포로 로마노",
   "lat": 41.89246,
   "lng": 12.48531,
   "summary": "팔라티노 언덕과 카피톨리노 언덕 사이의 골짜기에 있던 고대 로마의 중심 광장입니다. 원래는 습지에 가까웠는데 배수 시설(클로아카 막시마)로 말려 시장과 집회 장소가 되었다고 전해집니다. 원로원 의사당(쿠리아), 사투르누스 신전, 신성한 길(비아 사크라), 티투스와 셉티미우스 세베루스의 개선문 등이 모여 있었습니다. 로마가 쇠퇴하면서 땅 아래 묻혀 중세에는 소를 풀어 먹이던 곳이라 '캄포 바키노(소 들판)'로 불렸고, 본격적인 발굴은 18~19세기 이후에 진행되었습니다."
  },
  {
   "id": "san_clemente",
   "name": "산 클레멘테 대성당",
   "lat": 41.88897,
   "lng": 12.49794,
   "summary": "12세기 초에 지어진 성당 아래에 4세기 성당이 있고, 그 아래에는 1세기 건물들과 미트라 신전이 겹쳐 있는 3층 구조의 성당입니다. 위층에는 12세기 모자이크가 있고, 아래층에는 초기 기독교 시대의 프레스코와 이탈리아어 속어가 적힌 오래된 낙서가 남아 있다고 알려져 있습니다. 가장 아래층에서는 지하수가 흐르는 소리가 들린다고 해서, 시간을 거슬러 내려가는 느낌을 주는 곳으로 유명합니다."
  },
  {
   "id": "palatine",
   "name": "팔라티노 언덕",
   "lat": 41.8897,
   "lng": 12.4875,
   "summary": "로마 7개 언덕 중 가장 중심이 되는 언덕으로, 기원전 753년에 로물루스가 도시를 세웠다는 건국 전설의 무대입니다. 공화정 시대에는 부유한 귀족들이, 제정 시대에는 황제들이 궁전을 지었고, 영어의 '팰리스(궁전)'라는 단어가 이 언덕 이름 '팔라티움'에서 나왔다고 설명합니다. 아우구스투스의 집과 도미티아누스 황제의 궁전 터가 남아 있고, 언덕 위에서는 포로 로마노와 키르쿠스 막시무스 방향이 내려다보입니다."
  },
  {
   "id": "meta_sudans",
   "name": "메타 수단스 터",
   "lat": 41.88983,
   "lng": 12.49113,
   "summary": "콜로세움과 콘스탄티누스 개선문 사이에 있던 원뿔형 분수의 터입니다. 이름은 '땀 흘리는 반환점'이라는 뜻으로, 원뿔 꼭대기에서 물이 흘러내리는 모습에서 붙었다고 전해집니다. 서기 1세기 말 플라비우스 왕조 때 만들어졌고, 1930년대 도로 정비 과정에서 철거되어 지금은 둥근 터만 남아 있습니다."
  }
 ]
};
/*SHARED-END*/

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const log = (text, kind = 'info') => parent.postMessage({type: 'log', kind, text}, '*');
  const S = {lat: 41.8896, lng: 12.4895, bearing: 90, speed: 1.4, cb: null, deny: false, offline: false, minVersion: '', voice: '오른쪽 건물 뭐야?', cursor: {}};

  // ---------- 지리 ----------
  const R = 6371000, rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
  const dist = (a, b, c, d) => { const p1 = rad(a), p2 = rad(c), dp = p2 - p1, dl = rad(d - b); const x = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
  const bear = (a, b, c, d) => { const p1 = rad(a), p2 = rad(c), dl = rad(d - b); return (deg(Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl))) + 360) % 360; };
  const rel = (b, h) => ((b - h + 180) % 360 + 360) % 360 - 180;
  const dirOf = r => Math.abs(r) <= 45 ? 'front' : Math.abs(r) >= 135 ? 'back' : r > 0 ? 'right' : 'left';
  const DIR = {front: '정면', right: '오른쪽', back: '뒤쪽', left: '왼쪽'};
  const KW = {left: ['왼쪽', '왼편', '좌측', 'left'], right: ['오른쪽', '오른편', '우측', 'right'], back: ['뒤', 'behind', 'back'], front: ['앞', '정면', '맞은편', 'ahead', 'front']};
  const dirFromText = t => { t = t.toLowerCase(); for (const d of ['left', 'right', 'back', 'front']) if (KW[d].some(k => t.includes(k))) return d; return null; };

  function nearby(b) {
    return SHARED.PLACES.map(p => {
      const d = dist(b.lat, b.lng, p.lat, p.lng), br = bear(b.lat, b.lng, p.lat, p.lng);
      return {...p, types: [], distance_m: Math.round(d), bearing: Math.round(br), direction: b.heading == null ? 'front' : dirOf(rel(br, b.heading))};
    }).filter(p => p.distance_m <= (b.radius_m || 150)).sort((a, b2) => a.distance_m - b2.distance_m);
  }

  // ---------- 서버 plan_request 와 같은 규칙 ----------
  function plan(b) {
    const q = (b.question || '').trim(), d = dirFromText(q), ps = nearby(b);
    const others = pl => ps.filter(p => p.id !== pl.id).slice(0, 3);
    if (b.focus && q && !b.place_id && !d) { const place = ps.find(p => p.id === b.focus.id) || b.focus; return {mode: 'followup', place, neighbors: others(place)}; }
    if (!ps.length) return {msg: '근처에서 설명할 만한 장소를 찾지 못했어요. 조금 더 걸어 보세요.'};
    const targets = b.place_id ? ps.filter(p => p.id === b.place_id) : d ? ps.filter(p => p.direction === d)
      : [...ps].sort((x, y) => (x.direction !== 'front') - (y.direction !== 'front') || x.distance_m - y.distance_m);
    if (!targets.length) return {msg: `${DIR[d]}에는 눈에 띄는 장소가 없어요.`};
    return {mode: 'story', place: targets[0], neighbors: others(targets[0])};
  }

  const TONE = {
    historian: ['', '지금 눈앞의 이 풍경에 오랜 시간이 겹겹이 쌓여 있는 셈이죠.'],
    funny: ['자, 여기서 폰 꺼내시죠, 인증샷 각입니다!', '예나 지금이나 사람들이 몰리는 자리인 건 변함이 없네요.'],
    kid: ['친구야, 잘 들어봐!', '그럼 퀴즈! 지금 보이는 것 중에 제일 오래돼 보이는 돌을 찾아볼까?'],
    storyteller: ['잠깐 눈을 감고 상상해 보세요. 함성과 먼지, 그리고 뜨거운 햇살…', '그날의 이야기는 지금도 이 돌벽 어딘가에 남아 있다고들 하죠.'],
    insider: ['이건 아는 사람만 아는 건데요,', '운영 시간이나 입장 방법은 가기 전에 꼭 확인해 보세요.'],
  };
  const sentences = t => t.split(/(?<=[.!?])\s+/).filter(Boolean);

  // 데모 문장 생성: AI 가 아니라 준비된 장소 설명을 이야기 순서로 들려준다. 후속 질문은 '이어지는 부분'을 보여 주고 데모임을 밝힌다.
  function compose(b, pl) {
    const persona = b.persona || 'historian', tone = TONE[persona] || TONE.historian, p = pl.place;
    if (pl.mode === 'followup') {
      const all = sentences(p.summary), i = (S.cursor[p.id] = Math.min((S.cursor[p.id] ?? 0) + 1, all.length - 1));
      return ['(데모) 실제 앱에서는 AI가 질문에 맞춰 새로 답해요.', `지금은 준비된 설명 중 이어지는 부분을 들려드릴게요.`, all[i], '이어서 궁금한 게 있으면 물어보세요.'];
    }
    S.cursor[p.id] = 0;
    const n = pl.neighbors[0];
    return [tone[0], `${DIR[p.direction]} ${p.distance_m}미터 앞에 보이는 곳은 ${p.name}입니다.`, ...sentences(p.summary),
      n ? `근처 ${DIR[n.direction]}에는 ${n.name}도 있어요.` : '', tone[1], '더 궁금한 게 있으면 물어봐 주세요.'].filter(Boolean);
  }

  const ups = mode => mode === 'story' ? SHARED.FOLLOW_UPS.ko.slice(0, 3) : SHARED.FOLLOW_UPS.ko.slice(3);

  // ---------- 가짜 API ----------
  async function handle(path, body) {
    if (S.offline) throw new TypeError('Failed to fetch');
    await sleep(120);
    if (path === '/api/health') return {status: 200, json: {ok: true, llm: 'demo', tts: false, vision: true, places: 'demo', min_app_version: S.minVersion}};
    if (path === '/api/nearby') return {status: 200, json: nearby(body)};
    if (path === '/api/feedback') { log(`신고 접수: ${body.kind}${body.comment ? ' · ' + body.comment : ''}`, 'ok'); return {status: 200, json: {ok: true}}; }
    if (path === '/api/look') return {status: 200, json: {text: '(데모) 사진 속 건물은 근처의 유적으로 보여요. 실제 앱에서는 VLM이 사진을 보고 무엇인지 설명합니다.', candidates: [], mode: 'story'}};
    if (path === '/api/tts') return {status: 501, json: {detail: 'demo'}};            // → 앱이 브라우저 음성으로 폴백
    if (path === '/api/ask' || path === '/api/ask/stream') {
      const pl = plan(body);
      if (pl.msg) return {status: 200, sents: [pl.msg], meta: {mode: 'story', place: null, follow_ups: []}};
      return {status: 200, sents: compose(body, pl), meta: {mode: pl.mode, place: pl.place, follow_ups: ups(pl.mode)}};
    }
    return {status: 404, json: {detail: 'not found'}};
  }

  const realFetch = window.fetch.bind(window);
  window.fetch = async (url, init = {}) => {
    const path = new URL(url, location.href).pathname;
    if (!path.startsWith('/api/')) return realFetch(url, init);
    const body = init.body ? JSON.parse(init.body) : {};
    log(`fetch ${path}${path === '/api/ask/stream' ? ' (스트리밍)' : ''}`, 'net');
    const r = await handle(path, body);
    if (r.status !== 200) return new Response(JSON.stringify(r.json), {status: r.status});
    if (path === '/api/ask/stream') {
      const events = [{type: 'meta', ...r.meta}, ...r.sents.map(text => ({type: 'sentence', text})), {type: 'done'}];
      let i = 0; const enc = new TextEncoder(), signal = init.signal;
      return new Response(new ReadableStream({async pull(c) {
        if (signal && signal.aborted) throw new DOMException('Aborted', 'AbortError');
        if (i >= events.length) return c.close();
        await sleep(i < 2 ? 200 : 650);                                   // 문장이 하나씩 도착하는 느낌
        c.enqueue(enc.encode('data: ' + JSON.stringify(events[i++]) + '\n\n'));
      }}), {headers: {'Content-Type': 'text/event-stream'}});
    }
    if (path === '/api/ask') return new Response(JSON.stringify({text: r.sents.join(' '), ...r.meta}), {status: 200});
    return new Response(JSON.stringify(r.json), {status: 200, headers: {'Content-Type': 'application/json'}});
  };

  // ---------- 가짜 네이티브 플러그인 ----------
  const listeners = {};
  const emit = () => S.cb && S.cb({latitude: S.lat, longitude: S.lng, accuracy: 8, speed: S.speed, bearing: S.bearing, time: Date.now()});
  window.Capacitor = {
    isNativePlatform: () => true, getPlatform: () => platform,
    Plugins: {
      App: {addListener: (ev, cb) => { listeners[ev] = cb; }},
      BackgroundGeolocation: {
        start: async (opts, cb) => {
          log(`BackgroundGeolocation.start — 알림 "${opts.backgroundMessage}", 거리필터 ${opts.distanceFilter}m`, 'native');
          if (S.deny) { setTimeout(() => cb(undefined, {code: 'NOT_AUTHORIZED', message: 'denied'}), 60); return; }
          S.cb = cb; parent.postMessage({type: 'bg-started', message: opts.backgroundMessage}, '*'); setTimeout(emit, 80);
        },
        stop: async () => { S.cb = null; log('BackgroundGeolocation.stop', 'native'); parent.postMessage({type: 'bg-stopped'}, '*'); },
        openSettings: async () => { log('설정 앱 열기 (openSettings)', 'native'); },
      },
      SpeechRecognition: {
        checkPermissions: async () => ({speechRecognition: 'granted'}), requestPermissions: async () => ({speechRecognition: 'granted'}),
        start: async o => { log(`SpeechRecognition.start(${o.language}) → "${S.voice}"`, 'native'); await sleep(900); return {matches: [S.voice]}; },
      },
      Camera: {getPhoto: async o => { log(`Camera.getPhoto(width=${o.width}, 방향 보정)`, 'native'); return {dataUrl: 'data:image/jpeg;base64,/9j/4AAQ'}; }},
      CapacitorHttp: {request: async o => {
        const path = new URL(o.url, location.href).pathname;
        log(`CapacitorHttp ${path} (백그라운드 경로)`, 'net');
        const r = await handle(path, o.data || {});
        if (r.status !== 200) return {status: r.status, headers: {}, data: r.json};
        if (path === '/api/ask') return {status: 200, headers: {}, data: {text: r.sents.join(' '), ...r.meta}};
        return {status: 200, headers: {}, data: r.json};
      }},
    },
  };

  // ---------- 부모(조작 패널) → 시뮬레이터 ----------
  addEventListener('message', e => {
    const m = e.data; if (!m || m.type !== 'sim') return;
    if (m.cmd === 'move') { const h = rad(S.bearing); S.lat += (m.meters * Math.cos(h)) / 111320; S.lng += (m.meters * Math.sin(h)) / (111320 * Math.cos(rad(S.lat))); emit(); }
    else if (m.cmd === 'turn') { S.bearing = (S.bearing + m.deg + 360) % 360; emit(); }
    else if (m.cmd === 'bg') { log(m.value ? '앱이 백그라운드로 (화면 잠금)' : '앱이 포그라운드로', 'native'); listeners.appStateChange && listeners.appStateChange({isActive: !m.value}); }
    else if (m.cmd === 'offline') { S.offline = m.value; dispatchEvent(new Event(m.value ? 'offline' : 'online')); }
    else if (m.cmd === 'update') { S.minVersion = m.value ? '9.9.9' : ''; dispatchEvent(new Event('online')); }
    else if (m.cmd === 'voice') S.voice = m.value;
    else if (m.cmd === 'deny') S.deny = m.value;
    else if (m.cmd === 'where') parent.postMessage({type: 'where', lat: S.lat, lng: S.lng, bearing: S.bearing}, '*');
  });
  addEventListener('load', () => parent.postMessage({type: 'ready', platform}, '*'));
})();
