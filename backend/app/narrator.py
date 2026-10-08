"""해설 생성. GEMINI_API_KEY가 있으면 Gemini, 없으면 템플릿 기반 mock."""
import httpx

from . import config
from .geo import DIRECTION_EN, DIRECTION_KO
from .models import Place

# 페르소나 = 경쟁력의 핵심. 말투·구성·금지사항을 구체적으로 지정한다.
# 단, 어떤 페르소나든 '사실'은 [근거]에서만 가져오고 재미는 표현에서만 만든다.
PERSONAS = {
    "historian": {
        "label": "역사학자",
        "style": "차분하고 박식한 역사학자. 연도·인물·인과관계를 짚어 '왜 여기에 이게 있는지'를 설명하고, "
                 "고대와 현재를 잇는 한 줄 통찰로 마무리한다. 존댓말, 과장 금지.",
    },
    "funny": {
        "label": "유머러스",
        "style": "입담 좋은 현지 친구 같은 가이드. 첫 문장은 시선을 끄는 농담이나 과장된 비유로 시작하고, "
                 "역사 사실은 요즘 일상(주차, 맛집 줄, 층간소음, 인스타 등)에 빗대 웃기게 풀어준다. "
                 "비웃음이나 혐오 농담은 금지, 가벼운 자기비하와 반전 위주. 반말 섞인 친근한 존댓말.",
    },
    "kid": {
        "label": "아이용",
        "style": "초등학생에게 설명하는 다정한 선생님. 어려운 단어는 쉬운 비유로 바꾸고, "
                 "마지막에 '찾아볼까?' 같은 작은 관찰 퀴즈를 하나 낸다. 무서운 내용은 순화한다.",
    },
    "storyteller": {
        "label": "이야기꾼",
        "style": "라디오 드라마 내레이터. 장면을 상상하게 만드는 현장 묘사로 시작("
                 "'지금 눈을 감고 상상해 보세요…')하고, 한 인물의 시점으로 사건을 짧은 이야기처럼 들려준다. "
                 "단, 근거에 없는 대사나 사건은 지어내지 말고 '전해집니다'로 표시한다.",
    },
    "insider": {
        "label": "현지 고수",
        "style": "그 동네 10년 산 고수. 관광객이 놓치기 쉬운 포인트(보는 각도, 시간대, 줄 피하는 법)를 "
                 "귀띔하듯 알려준다. 확실하지 않은 영업시간·가격은 절대 단정하지 말고 '확인해 보세요'라고 한다.",
    },
}
LANGS = {"ko": "한국어", "en": "English", "it": "Italiano", "ja": "日本語"}


def build_prompt(place: Place, question: str, lang: str, persona: str, neighbors: list[Place]) -> str:
    near = ", ".join(f"{n.name}({DIRECTION_KO[n.direction]} {int(n.distance_m)}m)" for n in neighbors) or "없음"
    style = PERSONAS.get(persona, PERSONAS["historian"])["style"]
    return f"""당신은 걸으면서 이어폰으로 듣는 오디오 가이드입니다.
[페르소나] {style}
규칙:
- {LANGS.get(lang, '한국어')}로, 구어체로, 4~6문장(약 20초 분량). 목록·마크다운·이모지 금지.
- 페르소나는 '말투와 재미'에만 적용한다. 사실(연도·수치·인물)은 아래 [근거]에 있는 것만 쓰고, 없으면 지어내지 말고 모른다고 말할 것.
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
