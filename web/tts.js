// 자연스러운 낭독: 서버 TTS(/api/tts)를 문장 단위로 받아 이어 재생. 실패/미설정이면 브라우저 TTS로 폴백.
// 첫 문장이 합성되는 즉시 재생을 시작하고, 다음 문장은 재생 중에 미리 받아 둔다.
const Voice = (() => {
  let serverOk = true, token = 0, current = null;
  const split = t => (t.match(/[^.!?。…]+[.!?。…]*/g) || [t]).map(s => s.trim()).filter(Boolean);

  function browserSpeak(text, lang) {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === 'en' ? 'en-US' : 'ko-KR';
    speechSynthesis.speak(u);
  }
  async function fetchAudio(text, persona) {
    const r = await fetch('/api/tts', {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({text, persona}), signal: AbortSignal.timeout(15000)});
    if (r.status === 501 || r.status === 404) { serverOk = false; throw new Error('tts-off'); } // 이 세션은 서버 TTS 안 씀
    if (!r.ok) throw new Error('tts ' + r.status);
    return URL.createObjectURL(await r.blob());
  }
  function play(url) {
    return new Promise((res, rej) => {
      const a = current = new Audio(url);
      a.onended = () => { URL.revokeObjectURL(url); res(); };
      a.onerror = () => rej(new Error('audio'));
      a.play().catch(rej);
    });
  }
  function stop() { token++; if (current) { current.pause(); current = null; } if ('speechSynthesis' in window) speechSynthesis.cancel(); }

  async function speak(text, {persona = 'historian', lang = 'ko'} = {}) {
    stop();
    const my = token;
    if (!serverOk || lang !== 'ko') return browserSpeak(text, lang);
    const sentences = split(text);
    let next = fetchAudio(sentences[0], persona);
    try {
      for (let i = 0; i < sentences.length; i++) {
        const url = await next;
        if (my !== token) return;
        next = i + 1 < sentences.length ? fetchAudio(sentences[i + 1], persona) : null;
        if (next) next.catch(() => {});
        await play(url);
        if (my !== token) return;
      }
    } catch (e) {
      if (my === token) browserSpeak(sentences.join(' '), lang); // 도중 실패 시 전체를 브라우저 TTS로
    }
  }
  return {speak, stop};
})();
