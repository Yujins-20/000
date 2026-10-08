"""해설 생성. GEMINI_API_KEY가 있으면 Gemini, 없으면 템플릿 기반 mock."""
import httpx

from . import config
from .geo import DIRECTION_EN, DIRECTION_KO
from .models import Place

PERSONAS = {
    "historian": "차분하고 박식한 역사 해설가",
    "funny": "유머러스하고 수다스러운 현지 가이드",
    "kid": "아이에게 설명하듯 쉬운 말을 쓰는 가이드",
}
LANGS = {"ko": "한국어", "en": "English", "it": "Italiano", "ja": "日本語"}


def build_prompt(place: Place, question: str, lang: str, persona: str, neighbors: list[Place]) -> str:
    near = ", ".join(f"{n.name}({DIRECTION_KO[n.direction]} {int(n.distance_m)}m)" for n in neighbors) or "없음"
    return f"""당신은 {PERSONAS.get(persona, PERSONAS['historian'])}입니다. 걸으면서 이어폰으로 듣는 오디오 가이드입니다.
규칙:
- {LANGS.get(lang, '한국어')}로, 구어체로, 4~6문장(약 20초 분량). 목록·마크다운·이모지 금지.
- 아래 [근거]에 없는 연도·수치는 확신이 없으면 말하지 말 것. 모르면 모른다고 말할 것.
- 마지막 문장은 가까이에 있는 볼거리를 한 가지 방향과 함께 안내(예: "왼쪽 골목 안쪽에는 ...가 있어요").
[장소] {place.name} (사용자 기준 {DIRECTION_KO[place.direction]}, {int(place.distance_m)}m)
[근거] {place.summary or '제공된 정보 없음'}
[주변] {near}
[사용자 질문] {question or '이 장소에 대해 알려줘'}"""


def mock_text(place: Place, question: str, neighbors: list[Place], lang: str) -> str:
    where = DIRECTION_EN[place.direction] if lang == "en" else DIRECTION_KO[place.direction]
    tip = ""
    if neighbors:
        n = neighbors[0]
        tip = (f" Nearby, {n.name} is {DIRECTION_EN[n.direction]}." if lang == "en"
               else f" 근처 {DIRECTION_KO[n.direction]}에는 {n.name}도 있어요.")
    if lang == "en":
        return f"{where.capitalize()}, about {int(place.distance_m)} meters away, is {place.name}. {place.summary}{tip}"
    return f"{where} {int(place.distance_m)}미터 앞에 보이는 곳은 {place.name}입니다. {place.summary}{tip}"


def resolve_provider() -> str:
    p = config.LLM_PROVIDER
    if p == "auto":
        return "gemini" if config.GEMINI_API_KEY else "mock"
    return p


async def narrate_openai_compat(provider: str, prompt: str) -> str:
    url, default_model = config.OPENAI_COMPAT[provider]
    body = {"model": config.LLM_MODEL or default_model, "temperature": 0.7, "max_tokens": 400,
            "messages": [{"role": "user", "content": prompt}]}
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post(url, json=body, headers={"Authorization": f"Bearer {config.LLM_API_KEY}"})
        r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"].strip()


async def narrate(place: Place, question: str, lang: str, persona: str, neighbors: list[Place]) -> str:
    provider = resolve_provider()
    if provider in config.OPENAI_COMPAT:
        return await narrate_openai_compat(provider, build_prompt(place, question, lang, persona, neighbors))
    if provider != "gemini":
        return mock_text(place, question, neighbors, lang)
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{config.GEMINI_MODEL}:generateContent"
    body = {"contents": [{"parts": [{"text": build_prompt(place, question, lang, persona, neighbors)}]}],
            "generationConfig": {"temperature": 0.7, "maxOutputTokens": 400}}
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post(url, json=body, headers={"x-goog-api-key": config.GEMINI_API_KEY})
        r.raise_for_status()
    parts = r.json()["candidates"][0]["content"]["parts"]
    return "".join(p.get("text", "") for p in parts).strip()
