from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles

from . import narrator
from .cache import TTLCache
from .geo import direction_from_text
from .models import Answer, AskRequest, Location, Place
from .places import get_provider

app = FastAPI(title="WalkGuide")
cache = TTLCache()


def pick_target(places: list[Place], question: str) -> list[Place]:
    """질문 속 방향어가 있으면 그 방향 후보만, 없으면 정면 우선 → 가장 가까운 순."""
    d = direction_from_text(question)
    if d:
        return [p for p in places if p.direction == d]
    return sorted(places, key=lambda p: (p.direction != "front", p.distance_m))


@app.get("/api/health")
def health():
    return {"ok": True}


@app.post("/api/nearby", response_model=list[Place])
async def nearby(loc: Location):
    return await get_provider().nearby(loc)


@app.post("/api/ask", response_model=Answer)
async def ask(req: AskRequest):
    places = await get_provider().nearby(req)
    if not places:
        return Answer(text="근처에서 설명할 만한 장소를 찾지 못했어요. 조금 더 걸어 보세요." if req.lang == "ko"
                      else "I couldn't find anything notable nearby. Try walking a bit further.")
    targets = pick_target(places, req.question)
    if not targets:
        return Answer(text="그 방향에는 눈에 띄는 장소가 없어요." if req.lang == "ko"
                      else "There's nothing notable in that direction.", candidates=places[:3])
    place = targets[0]
    neighbors = [p for p in places if p.id != place.id][:3]
    # 일반 해설(질문 없음/방향 질문)만 캐시. 방향 정보가 문장에 들어가므로 방향도 키에 포함.
    generic = direction_from_text(req.question) is not None or not req.question.strip()
    key = (place.id, place.direction, req.lang, req.persona) if generic else None
    text = cache.get(key) if key else None
    if text is None:
        try:
            text = await narrator.narrate(place, req.question, req.lang, req.persona, neighbors)
        except Exception as e:  # 외부 API 장애 시 앱이 멈추지 않도록
            raise HTTPException(502, f"narration failed: {type(e).__name__}") from e
        if key:
            cache.set(key, text)
    return Answer(text=text, place=place, candidates=targets[:3])


# 프런트엔드 정적 서빙 (API 라우트 이후에 마운트)
_web = Path(__file__).resolve().parents[2] / "web"
if _web.exists():
    app.mount("/", StaticFiles(directory=_web, html=True), name="web")
