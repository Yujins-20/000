"""카메라 모드: 사용자가 찍은 사진 + 위치/방향 후보 장소를 함께 VLM에 주어 '지금 보는 것'을 특정하고 해설한다."""
import base64
import binascii

from . import config, vlm
from .geo import DIRECTION_KO
from .models import Place
from .narrator import PERSONAS


class BadImage(ValueError):
    pass


def validate_image(data_url: str) -> str:
    """data:image/(jpeg|png|webp);base64,... 만 허용하고 크기를 제한한다."""
    if not data_url.startswith("data:image/") or ";base64," not in data_url:
        raise BadImage("image must be a base64 data URL")
    head, b64 = data_url.split(";base64,", 1)
    if head[len("data:image/"):] not in ("jpeg", "png", "webp"):
        raise BadImage("unsupported image type")
    try:
        raw = base64.b64decode(b64, validate=True)
    except binascii.Error as e:
        raise BadImage("invalid base64") from e
    if len(raw) > config.MAX_IMAGE_BYTES:
        raise BadImage("image too large")
    return data_url


def build_messages(image_url: str, candidates: list[Place], question: str, persona: str) -> list[dict]:
    style = PERSONAS.get(persona, PERSONAS["historian"])["style"]
    cand = "\n".join(
        f"- {p.name} (사용자 기준 {DIRECTION_KO[p.direction]}, {int(p.distance_m)}m): {p.summary or '근거 없음'}"
        for p in candidates) or "- (주변 후보 정보 없음)"
    text = f"""당신은 걸으면서 이어폰으로 듣는 오디오 가이드입니다.
[페르소나] {style}
사용자가 지금 보고 있는 건물/장소를 찍은 사진입니다. 아래 [주변 후보]는 GPS 기준 근처 장소입니다.
규칙:
- 사진 속 대상이 후보 중 무엇인지 사진의 단서(외관, 간판, 조각, 형태)로 판단하세요. 확신이 낮으면 "아마 ~로 보여요"처럼 불확실성을 밝히고, 후보에 없으면 보이는 것만 설명하세요.
- 사실(연도·수치·인물)은 후보의 근거에 있는 것만 쓰고 지어내지 마세요. 사진에 보이는 시각적 특징은 자유롭게 짚어도 됩니다.
- 한국어 구어체, 4~6문장, 목록·마크다운·이모지 금지.
[주변 후보]
{cand}
[사용자 질문] {question or '지금 보이는 이게 뭐야?'}"""
    return [{"role": "user", "content": [
        {"type": "image_url", "image_url": {"url": image_url}},
        {"type": "text", "text": text},
    ]}]


async def look(image_url: str, candidates: list[Place], question: str, persona: str) -> str:
    return await vlm.chat(build_messages(validate_image(image_url), candidates, question, persona), max_tokens=500)
