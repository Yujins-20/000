"""위치/방향 계산. 사용자의 heading 기준으로 장소가 어느 쪽에 있는지 판정한다."""
import math

EARTH_R = 6_371_000.0


def distance_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_R * math.asin(math.sqrt(a))


def bearing_deg(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """북쪽 기준 시계방향 0~360."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dl = math.radians(lng2 - lng1)
    y = math.sin(dl) * math.cos(p2)
    x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


def relative_angle(bearing: float, heading: float) -> float:
    """-180~180. 양수 = 오른쪽, 음수 = 왼쪽."""
    return (bearing - heading + 180) % 360 - 180


def direction_of(rel: float) -> str:
    """front / right / back / left (각 90도 섹터, 정면과 후방은 ±45도)."""
    a = abs(rel)
    if a <= 45:
        return "front"
    if a >= 135:
        return "back"
    return "right" if rel > 0 else "left"


DIRECTION_KO = {"front": "정면", "right": "오른쪽", "back": "뒤쪽", "left": "왼쪽"}
DIRECTION_EN = {"front": "ahead", "right": "to your right", "back": "behind you", "left": "to your left"}

# 질문 속 방향 키워드 (한/영/이탈리아어 일부)
_KEYWORDS = {
    "left": ("왼쪽", "왼편", "좌측", "left", "sinistra"),
    "right": ("오른쪽", "오른편", "우측", "right", "destra"),
    "back": ("뒤", "뒤쪽", "behind", "back"),
    "front": ("앞", "정면", "맞은편", "ahead", "front", "straight", "davanti"),
}


def direction_from_text(text: str) -> str | None:
    t = text.lower()
    for d in ("left", "right", "back", "front"):
        if any(k in t for k in _KEYWORDS[d]):
            return d
    return None
