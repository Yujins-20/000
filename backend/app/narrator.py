"""해설 생성: 스토리형 첫 해설 + 멀티턴 후속 질문. 프롬프트/메시지 구성과 mock."""
import httpx

from . import config, llm
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


STORY_OUTLINE = """이야기 구성 (자연스럽게 이어서 말하고, 번호·소제목은 말하지 말 것):
1) 장면 도입: 지금 눈앞에 보이는 모습과 위치(방향·거리)로 시작
2) 탄생 이야기: 누가·언제·왜 만들었는지, 당시 사람들에게 어떤 의미였는지
3) 흥미로운 반전이나 일화 1~2개 (전해지는 이야기는 '전해집니다'로 표시)
4) 시간이 흐르며 겪은 일과 지금의 모습, 눈여겨볼 관전 포인트(보는 위치·세부 요소)
5) 주변 연결: 가까운 볼거리를 방향과 함께 소개
6) 마지막 한 문장: 더 궁금한 걸 물어봐 달라고 자연스럽게 권유"""

KNOWLEDGE_RULES = {
    "rich": """지식 사용 규칙 (풍부하게, 단 정직하게):
- [근거]는 검증된 자료입니다. 이것을 뼈대로 삼고, 당신이 알고 있는 널리 알려진 배경지식(건축·역사·인물·일화·양식·그 시대 상황)으로 살을 붙여 풍성하게 설명하세요.
- 연도·수치·고유명사는 확실할 때만 말하고, 확실하지 않으면 "대략", "자료마다 달라요"처럼 불확실성을 밝히세요. 근거에 없는 것을 지어내지 마세요(지어내지 말고 모르면 모른다고 말하기).
- 전설·일화는 "~라고 전해집니다"로 표시하고, [근거]와 당신의 기억이 충돌하면 [근거]를 따르세요.""",
    "grounded": """지식 사용 규칙 (엄격):
- 사실(연도·수치·인물)은 [근거]에 있는 것만 쓰세요. 근거에 없으면 지어내지 말고 모른다고 말하세요.""",
}


NO_SUMMARY = "제공된 정보 없음 (일반 상식으로만 조심스럽게 설명하고, 모르는 부분은 모른다고 말할 것)"

TASK_FOLLOWUP = """지금은 방금 들려준 이야기에 대한 후속 질문에 답하는 대화입니다.
- {language}로 구어체 3~6문장(약 20초). 질문에 먼저 직접 답하고, 이야기하던 장소({place})와 이어서 설명하세요.
- 이전 대화에서 이미 한 말을 반복하지 말고, 새 정보를 주세요. 마지막에 이어서 궁금해할 만한 것을 한 가지 제안해도 좋습니다.
- 질문이 이 장소와 무관하면 짧게 답하고 다시 주변 이야기로 자연스럽게 돌아오세요."""

TASK_STORY = """지금은 이 장소를 처음 소개하는 '이야기'입니다. 한 편의 스토리를 들려주듯 말하세요.
- {language}로 구어체, 10~14문장(약 70~100초 분량). 한 문장은 너무 길지 않게.
{outline}"""

SYSTEM_TEMPLATE = """당신은 걸으면서 이어폰으로 듣는 오디오 가이드입니다. 목록·마크다운·이모지·괄호 설명은 쓰지 말고 소리 내어 읽기 좋은 문장으로만 말하세요.
[페르소나] {style}
- 페르소나는 '말투와 재미'에만 적용합니다. 사실은 아래 지식 사용 규칙을 따르세요.
{knowledge}

{task}

[장소] {place} (사용자 기준 {direction}, {distance}m)
[근거] {summary}
[주변] {near}"""


def build_system(place: Place, lang: str, persona: str, neighbors: list[Place], mode: str = "story",
                 depth: str = "rich") -> str:
    # 템플릿은 web/sim.html 로 그대로 내보내져(scripts/sync_sim.py) 시뮬레이터와 항상 같은 프롬프트를 쓴다.
    near = ", ".join(f"{n.name}({DIRECTION_KO[n.direction]} {int(n.distance_m)}m)" for n in neighbors) or "없음"
    task = (TASK_FOLLOWUP if mode == "followup" else TASK_STORY).format(
        language=LANGS.get(lang, "한국어"), place=place.name, outline=STORY_OUTLINE)
    return SYSTEM_TEMPLATE.format(
        style=PERSONAS.get(persona, PERSONAS["historian"])["style"],
        knowledge=KNOWLEDGE_RULES.get(depth, KNOWLEDGE_RULES["rich"]), task=task, place=place.name,
        direction=DIRECTION_KO[place.direction], distance=int(place.distance_m),
        summary=place.summary or NO_SUMMARY, near=near)


def shared_for_js() -> dict:
    """시뮬레이터(JS)와 공유하는 표시용 자산(페르소나 이름, 추천 질문). 프롬프트는 서버만 가진다."""
    return {"PERSONAS": {k: {"label": v["label"]} for k, v in PERSONAS.items()}, "FOLLOW_UPS": FOLLOW_UPS}


def build_messages(place: Place, question: str, lang: str, persona: str, neighbors: list[Place],
                   mode: str = "story", depth: str = "rich", history: list[dict] | None = None) -> list[dict]:
    hist = [{"role": h["role"], "content": h["content"][:2000]} for h in (history or [])][-8:]
    default_q = "이 장소를 이야기해줘" if mode == "story" else "더 알려줘"
    return ([{"role": "system", "content": build_system(place, lang, persona, neighbors, mode, depth)}]
            + hist + [{"role": "user", "content": question.strip() or default_q}])


def max_tokens_for(mode: str) -> int:
    return 1400 if mode == "story" else 700


def mock_text(place: Place, question: str, neighbors: list[Place], lang: str, mode: str = "story") -> str:
    """AI 엔진이 없을 때의 정직한 대체 응답. 후속 질문은 '답하는 척'하지 않는다."""
    where = DIRECTION_EN[place.direction] if lang == "en" else DIRECTION_KO[place.direction]
    if mode == "followup":
        return ("지금은 AI 엔진이 연결되어 있지 않아서 자유 질문에는 답할 수 없어요. "
                f"{place.name}에 대해 이미 들려드린 내용 말고는 준비된 해설이 없습니다.")
    tip = ""
    if neighbors:
        n = neighbors[0]
        tip = (f" Nearby, {n.name} is {DIRECTION_EN[n.direction]}." if lang == "en"
               else f" 근처 {DIRECTION_KO[n.direction]}에는 {n.name}도 있어요.")
    if lang == "en":
        return f"{where.capitalize()}, about {int(place.distance_m)} meters away, is {place.name}. {place.summary}{tip}"
    return f"{where} {int(place.distance_m)}미터 앞에 보이는 곳은 {place.name}입니다. {place.summary}{tip}"


async def narrate_openai_compat(provider: str, prompt: str) -> str:
    """(하위호환) 단일 프롬프트 호출."""
    return await llm._oai_complete(provider, [{"role": "user", "content": prompt}], 400)


def resolve_provider() -> str:
    return llm.resolve_provider()


async def narrate(place: Place, question: str, lang: str, persona: str, neighbors: list[Place],
                  mode: str = "story", depth: str = "rich", history: list[dict] | None = None) -> str:
    if resolve_provider() == "mock":
        return mock_text(place, question, neighbors, lang, mode)
    return await llm.complete(build_messages(place, question, lang, persona, neighbors, mode, depth, history),
                              max_tokens=max_tokens_for(mode))


async def narrate_stream(place: Place, question: str, lang: str, persona: str, neighbors: list[Place],
                         mode: str = "story", depth: str = "rich", history: list[dict] | None = None):
    """텍스트 델타를 순서대로 yield."""
    if resolve_provider() == "mock":
        yield mock_text(place, question, neighbors, lang, mode)
        return
    async for d in llm.stream(build_messages(place, question, lang, persona, neighbors, mode, depth, history),
                              max_tokens=max_tokens_for(mode)):
        yield d


FOLLOW_UPS = {
    "ko": ["누가, 왜 만들었어?", "재밌는 일화 하나만 더 들려줘", "여기서 뭘 눈여겨보면 좋아?",
           "주변에 또 볼 만한 곳은?", "그 뒤로 어떻게 변했어?", "사진 찍기 좋은 위치는?"],
    "en": ["Who built it, and why?", "Tell me one more fun story", "What should I look at here?",
           "What else is nearby?", "How did it change over time?", "Where's the best photo spot?"],
}


def follow_ups(lang: str, mode: str) -> list[str]:
    items = FOLLOW_UPS.get(lang, FOLLOW_UPS["ko"])
    return items[:3] if mode == "story" else items[3:]
