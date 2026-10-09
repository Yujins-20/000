// 웹(PWA)과 네이티브(Capacitor 앱)를 같은 인터페이스로 감싼다. 앱 코드는 Native.* 만 부른다.
//  - 위치: 네이티브는 백그라운드 위치(화면 꺼져도 갱신), 웹은 watchPosition
//  - 방향: 화면을 보고 있으면 나침반, 주머니 속(백그라운드)이면 '걷는 방향(GPS 진행방향)'
//  - 음성 인식: 네이티브 플러그인(Android WebView 는 Web Speech 인식 미지원), 웹은 SpeechRecognition
//  - 사진: 네이티브 카메라 플러그인, 웹은 <input type=file capture>
//  - 백그라운드 네트워크: Android WebView 는 5분 넘게 백그라운드면 HTTP를 제한하므로 네이티브 HTTP 사용
const Native = (() => {
  const cap = typeof window !== 'undefined' ? window.Capacitor : undefined;
  const isNative = !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
  const platform = isNative ? cap.getPlatform() : 'web';
  const P = name => (cap && cap.Plugins ? cap.Plugins[name] : undefined);

  // ---------- 순수 로직 (node --test 로 검증) ----------
  const MIN_COURSE_SPEED = 0.7; // m/s 이상 움직일 때만 GPS 진행방향을 믿는다

  function normalizeLocation(l) {
    // 네이티브 플러그인 Location(latitude/longitude/bearing/speed) 과 웹 GeolocationPosition 을 같은 모양으로
    if (l && l.coords) {
      const c = l.coords;
      return {lat: c.latitude, lng: c.longitude, accuracy: c.accuracy, speed: c.speed, bearing: c.heading, time: l.timestamp};
    }
    return {lat: l.latitude, lng: l.longitude, accuracy: l.accuracy, speed: l.speed, bearing: l.bearing, time: l.time};
  }

  function courseFrom(loc, prev) {
    // 속도가 충분할 때만 진행방향 갱신, 아니면 직전 값 유지
    const ok = loc.bearing != null && !Number.isNaN(loc.bearing) && loc.speed != null && loc.speed > MIN_COURSE_SPEED;
    return ok ? ((loc.bearing % 360) + 360) % 360 : prev;
  }

  function chooseHeading({compass, course, foreground}) {
    // 화면을 보고 있으면(손에 든 폰) 나침반=사용자가 보는 방향. 주머니 속이면 폰 방향은 무의미 → 걷는 방향.
    if (foreground && compass != null) return {deg: compass, source: 'compass'};
    if (course != null) return {deg: course, source: 'course'};
    if (compass != null) return {deg: compass, source: 'compass'};
    return {deg: null, source: 'none'};
  }

  function compareVersions(a, b) {
    const pa = String(a).split('.').map(n => parseInt(n, 10) || 0), pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const d = (pa[i] || 0) - (pb[i] || 0);
      if (d) return d < 0 ? -1 : 1;
    }
    return 0;
  }

  // ---------- 앱 상태(포그라운드/백그라운드) ----------
  let hidden = typeof document !== 'undefined' ? document.hidden : false;
  const stateListeners = [];
  const setHidden = h => { if (h !== hidden) { hidden = h; stateListeners.forEach(f => f(h)); } };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => setHidden(document.hidden));
  if (isNative && P('App')) P('App').addListener('appStateChange', s => setHidden(!s.isActive));
  const onAppState = f => stateListeners.push(f);

  // ---------- 위치 / 방향 ----------
  let compass = null, course = null, stopLoc = null;
  const setCompass = deg => { compass = deg; };
  const heading = () => chooseHeading({compass, course, foreground: !hidden});

  async function startLocation({onLocation, onError}) {
    const emit = raw => {
      const loc = normalizeLocation(raw);
      course = courseFrom(loc, course);
      onLocation(loc);
    };
    if (isNative && P('BackgroundGeolocation')) {
      const BG = P('BackgroundGeolocation');
      await BG.start({
        backgroundTitle: '워크가이드',
        backgroundMessage: '걷는 동안 주변 장소를 찾아 안내하고 있어요',
        requestPermissions: true, stale: false, distanceFilter: 10,
      }, (loc, err) => {
        if (err) return onError(Object.assign(new Error(err.message || 'location'), {code: err.code}));
        if (loc) emit(loc);
      });
      stopLoc = () => BG.stop();
      return;
    }
    if (!navigator.geolocation) return onError(Object.assign(new Error('no geolocation'), {code: 'UNAVAILABLE'}));
    const id = navigator.geolocation.watchPosition(emit, e => onError(Object.assign(new Error(e.message), {code: e.code === 1 ? 'NOT_AUTHORIZED' : 'ERROR'})),
      {enableHighAccuracy: true, maximumAge: 2000});
    stopLoc = () => navigator.geolocation.clearWatch(id);
  }
  const stopLocation = () => { if (stopLoc) { stopLoc(); stopLoc = null; } };
  const openSettings = async () => { const BG = P('BackgroundGeolocation'); if (BG && BG.openSettings) await BG.openSettings(); };

  // ---------- 나침반 권한/이벤트 ----------
  async function startCompass() {
    if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) {
      try { await DeviceOrientationEvent.requestPermission(); } catch (e) { /* 거부되면 진행방향만 사용 */ }
    }
    const on = e => {
      if (typeof e.webkitCompassHeading === 'number') setCompass(e.webkitCompassHeading);
      else if (e.alpha != null) setCompass((360 - e.alpha) % 360);
    };
    addEventListener('deviceorientationabsolute', on, true);
    addEventListener('deviceorientation', on, true);
  }

  // ---------- 음성 인식 ----------
  async function listen(lang) {
    const locale = lang === 'en' ? 'en-US' : 'ko-KR';
    const SRN = P('SpeechRecognition');
    if (isNative && SRN) {
      let perm = await SRN.checkPermissions();
      if (perm.speechRecognition !== 'granted') perm = await SRN.requestPermissions();
      if (perm.speechRecognition !== 'granted') throw Object.assign(new Error('permission'), {code: 'NOT_AUTHORIZED'});
      const r = await SRN.start({language: locale, maxResults: 1, partialResults: false, popup: false});
      return (r.matches && r.matches[0]) || null;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) throw Object.assign(new Error('unsupported'), {code: 'UNSUPPORTED'});
    return new Promise((res, rej) => {
      const r = new SR();
      r.lang = locale;
      r.onresult = e => res(e.results[0][0].transcript);
      r.onerror = e => rej(Object.assign(new Error(e.error), {code: e.error === 'not-allowed' ? 'NOT_AUTHORIZED' : 'ERROR'}));
      r.onend = () => res(null);
      r.start();
    });
  }

  // ---------- 사진 (네이티브만; 웹은 null → 파일 입력 사용) ----------
  async function takePhoto() {
    const Cam = P('Camera');
    if (!(isNative && Cam)) return null;
    const r = await Cam.getPhoto({quality: 80, width: 1024, resultType: 'dataUrl', source: 'CAMERA', correctOrientation: true});
    return r.dataUrl || null;
  }

  // ---------- 화면 유지(웹) / 잠금화면 컨트롤 ----------
  let wake = null;
  async function keepAwake(on) {
    if (isNative) return; // 네이티브는 백그라운드 위치로 계속 동작하므로 화면을 켜 둘 필요 없음
    try {
      if (on && 'wakeLock' in navigator && !wake) {
        wake = await navigator.wakeLock.request('screen');
        wake.addEventListener('release', () => { wake = null; });
      } else if (!on && wake) { await wake.release(); wake = null; }
    } catch (e) { /* 미지원/거부: 무시 */ }
  }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (!document.hidden && Native._wakeWanted) keepAwake(true); });

  function mediaSession({title, onStop}) {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({title: title || '워크가이드', artist: '오디오 가이드'});
      navigator.mediaSession.setActionHandler('stop', onStop);
      navigator.mediaSession.setActionHandler('pause', onStop);
    } catch (e) { /* 일부 브라우저 미지원 */ }
  }

  // ---------- 백그라운드에서의 네트워크 ----------
  const useNativeHttp = () => isNative && hidden && !!P('CapacitorHttp');
  async function nativePostJson(url, body) {
    const r = await P('CapacitorHttp').request({url, method: 'POST', headers: {'Content-Type': 'application/json'}, data: body, responseType: 'json'});
    return {status: r.status, data: r.data};
  }
  async function nativePostAudio(url, body) {
    const r = await P('CapacitorHttp').request({url, method: 'POST', headers: {'Content-Type': 'application/json'}, data: body, responseType: 'blob'});
    if (r.status !== 200 || !r.data) return null;
    const ct = (r.headers && (r.headers['Content-Type'] || r.headers['content-type'])) || 'audio/mpeg';
    return `data:${ct};base64,${r.data}`;
  }

  const api = {
    isNative, platform, onAppState, isHidden: () => hidden,
    startLocation, stopLocation, openSettings, startCompass, setCompass, heading,
    listen, takePhoto, keepAwake, mediaSession,
    useNativeHttp, nativePostJson, nativePostAudio,
    _wakeWanted: false,
    normalizeLocation, courseFrom, chooseHeading, compareVersions, MIN_COURSE_SPEED,
  };
  return api;
})();

if (typeof module !== 'undefined') module.exports = Native;
