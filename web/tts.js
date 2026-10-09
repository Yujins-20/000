// 문장 큐 기반 낭독. 스트리밍 응답의 문장이 도착하는 즉시 읽기 시작하고, 다음 문장은 읽는 동안 미리 합성해 둔다.
// 서버 TTS(/api/tts)가 없거나 실패하면 그 문장부터 브라우저 TTS로 자동 폴백한다.
//   Voice.start({persona, lang}) → Voice.push(sentence)* → Voice.end()      (스트리밍)
//   Voice.say(text, opts)                                                    (한 번에)
const Voice = (() => {
  let serverOk = true, sid = 0, cur = null, audio = null, base = '', fetcher = null;
  const AHEAD = 2; // 재생 중 미리 합성해 둘 문장 수
  const split = t => (t.match(/[^.!?。…]+[.!?。…]*/g) || [t]).map(s => s.trim()).filter(Boolean);

  async function fetchAudio(text, persona) {
    try {
      if (fetcher) { const u = await fetcher(text, persona); if (u) return u; } // 예: 앱이 백그라운드일 때 네이티브 HTTP
      const r = await fetch(base + '/api/tts', {method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({text, persona}), signal: AbortSignal.timeout(20000)});
      if (r.status === 501 || r.status === 404) { serverOk = false; return null; } // 이 세션은 서버 TTS 안 씀
      if (!r.ok) return null;
      return URL.createObjectURL(await r.blob());
    } catch { return null; }
  }
  function prefetch(s) {
    if (!serverOk || s.opts.lang !== 'ko') return;
    for (let k = s.i; k < Math.min(s.items.length, s.i + 1 + AHEAD); k++)
      if (!s.items[k].p) s.items[k].p = fetchAudio(s.items[k].text, s.opts.persona);
  }
  function playUrl(url, s) {
    return new Promise(res => {
      const a = audio = new Audio(url);
      s.cancelPlay = () => { a.pause(); res(false); };
      a.onended = () => { URL.revokeObjectURL(url); res(true); };
      a.onerror = () => res(false);
      a.play().catch(() => res(false));
    });
  }
  function browserSpeak(text, lang, s) {
    return new Promise(res => {
      if (!('speechSynthesis' in window)) return res();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang === 'en' ? 'en-US' : 'ko-KR';
      const t = setTimeout(res, Math.max(4000, text.length * 300)); // 일부 브라우저의 무응답 방지
      u.onend = u.onerror = () => { clearTimeout(t); res(); };
      s.cancelPlay = () => { clearTimeout(t); res(); };
      speechSynthesis.speak(u);
    });
  }
  async function run(s) {
    while (true) {
      while (s.i >= s.items.length) {
        if (s.cancelled) return;
        if (s.ended) { s.done = true; return; }
        await new Promise(r => { s.wake = r; });
      }
      if (s.cancelled) return;
      prefetch(s);
      const it = s.items[s.i];
      const url = it.p ? await it.p : null;
      if (s.cancelled) return;
      if (!(url && await playUrl(url, s)) && !s.cancelled) await browserSpeak(it.text, s.opts.lang, s);
      s.i++;
    }
  }

  function stop() {
    if (cur) { cur.cancelled = true; cur.wake && cur.wake(); cur.cancelPlay && cur.cancelPlay(); }
    if (audio) audio.pause();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    cur = null;
  }
  function start(opts = {}) {
    stop();
    cur = {id: ++sid, opts: {persona: 'historian', lang: 'ko', ...opts}, items: [], i: 0, ended: false, done: false};
    run(cur);
  }
  function push(text) {
    if (!cur || !text.trim()) return;
    cur.items.push({text: text.trim(), p: null});
    prefetch(cur);
    cur.wake && cur.wake();
  }
  function end() { if (cur) { cur.ended = true; cur.wake && cur.wake(); } }
  function say(text, opts) { start(opts); split(text).forEach(push); end(); }
  const speaking = () => !!cur && !cur.done;
  // 서버 주소 지정(다른 도메인에서 열었을 때). 바꾸면 서버 TTS를 다시 시도한다.
  function setBase(url) { base = (url || '').replace(/\/+$/, ''); serverOk = true; }
  // 전송 계층 교체 훅: (text, persona) => url | null. null 이면 기본 fetch 를 쓴다.
  const setFetcher = f => { fetcher = f; };
  return {start, push, end, say, stop, speaking, split, setBase, setFetcher};
})();
