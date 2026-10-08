"""자연스러운 낭독을 위한 TTS 파이프라인: 텍스트 정규화 → 문장 분할 → (자체 호스팅 OpenAI 호환 TTS) → 디스크 캐시."""
import hashlib
import re
from pathlib import Path

import httpx

from . import config

# ---------- 1) 정규화: 숫자·약어를 '읽는 소리'로 ----------
_D = "영일이삼사오육칠팔구"
_U = ["", "십", "백", "천"]


def sino(n: int) -> str:
    """한자어 수: 315 → 삼백십오, 12 → 십이, 50000 → 오만."""
    if n == 0:
        return "영"
    out = []
    for big, name in ((10**8, "억"), (10**4, "만")):
        if n >= big:
            q, n = divmod(n, big)
            out.append(("" if q == 1 and name == "만" else sino(q)) + name)
    if n:
        s = ""
        for i, ch in enumerate(reversed(str(n))):
            d = int(ch)
            if d:
                s = (("" if d == 1 and i > 0 else _D[d]) + _U[i]) + s
        out.append(s)
    return "".join(out)


_SINO_COUNTERS = r"(년|월|일|세기|층|미터|킬로미터|퍼센트|도|분|초|번지|호|세|억|만|천|백)"
_NO_SPACE = {"억", "만", "천", "백"}  # 5만 → 오만 (붙여 읽음)
_LEXICON = {  # 발음이 흔들리는 표기 → 읽는 소리
    "BC": "기원전", "AD": "서기", "UNESCO": "유네스코", "km": "킬로미터", "m²": "제곱미터",
    "%": " 퍼센트",
}


def normalize(text: str) -> str:
    t = re.sub(r"(\d+)\s*m\b", r"\1미터", text)  # 90m → 90미터
    for k, v in _LEXICON.items():
        t = re.sub(rf"\b{re.escape(k)}\b", v, t) if k.isalpha() else t.replace(k, v)
    t = re.sub(r"(\d{1,3}(?:,\d{3})+|\d+)\s*" + _SINO_COUNTERS,
               lambda m: sino(int(m.group(1).replace(",", ""))) + ("" if m.group(2) in _NO_SPACE else " ") + m.group(2), t)
    t = re.sub(r"\s*[\n\r]+\s*", ". ", t)
    return re.sub(r"\s{2,}", " ", t).strip()


# ---------- 2) 문장 분할 (첫 문장을 빨리 재생하기 위해) ----------
def split_sentences(text: str, max_len: int = 80) -> list[str]:
    parts = [p.strip() for p in re.split(r"(?<=[.!?。…])\s+", text) if p.strip()]
    out: list[str] = []
    for p in parts:
        while len(p) > max_len:  # 너무 긴 문장은 쉼표/공백 기준으로 자름
            cut = max(p.rfind(",", 0, max_len), p.rfind(" ", 0, max_len))
            cut = cut if cut > 20 else max_len
            out.append(p[:cut + 1].strip())
            p = p[cut + 1:].strip()
        if p:
            out.append(p)
    return out


# ---------- 3) 페르소나별 목소리 연기 지시 (TTS가 instruct/instructions 를 지원할 때) ----------
VOICE_STYLE = {
    "historian": "차분하고 신뢰감 있는 중저음, 또박또박 느린 속도",
    "funny": "밝고 장난기 있는 톤, 빠른 템포, 농담 뒤에 짧게 쉼",
    "kid": "다정하고 부드러운 선생님 목소리, 천천히 쉬운 발음, 질문은 올려서",
    "storyteller": "라디오 드라마 내레이터, 낮고 몰입감 있는 톤, 장면 전환에서 긴 쉼",
    "insider": "친구에게 귀띔하듯 낮고 친근한 속삭임 톤",
}


# ---------- 4) 합성 + 캐시 ----------
def configured() -> bool:
    return bool(config.TTS_BASE_URL)


def cache_key(text: str, persona: str, voice: str) -> str:
    return hashlib.sha256(f"{config.TTS_MODEL}|{voice}|{persona}|{text}".encode()).hexdigest()


async def synthesize(text: str, persona: str = "historian") -> tuple[bytes, str]:
    """(오디오 바이트, mime). 동일 문장·목소리는 디스크 캐시 재사용."""
    spoken = normalize(text)[: config.MAX_TTS_CHARS]
    voice = config.TTS_VOICE
    fmt = config.TTS_FORMAT
    mime = "audio/wav" if fmt == "wav" else "audio/mpeg"
    path = Path(config.TTS_CACHE_DIR) / f"{cache_key(spoken, persona, voice)}.{fmt}"
    if path.exists():
        return path.read_bytes(), mime
    body = {"model": config.TTS_MODEL, "input": spoken, "response_format": fmt,
            "instructions": VOICE_STYLE.get(persona, VOICE_STYLE["historian"])}
    if voice:
        body["voice"] = voice
    headers = {"Authorization": f"Bearer {config.TTS_API_KEY}"} if config.TTS_API_KEY else {}
    async with httpx.AsyncClient(timeout=60) as c:
        r = await c.post(config.TTS_BASE_URL.rstrip("/") + "/audio/speech", json=body, headers=headers)
        r.raise_for_status()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(r.content)
    return r.content, mime
