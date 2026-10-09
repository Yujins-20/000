import json
from pathlib import Path

from fastapi import FastAPI, HTTPException, Response
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles

from . import narrator, tts, vision
from .cache import TTLCache
from .geo import direction_from_text
from .models import Answer, AskRequest, LookRequest, Location, Place, TtsRequest
from .places import get_provider
from .streaming import SentenceChunker

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


class Plan:
    """한 번의 요청을 어떻게 처리할지에 대한 결정(대상 장소, 모드, LLM 메시지, 캐시 키)."""

    def __init__(self, place=None, neighbors=None, mode="story", message=None, candidates=None):
        self.place, self.neighbors, self.mode = place, neighbors or [], mode
        self.message, self.candidates = message, candidates or []
        self.messages: list[dict] = []
        self.cache_key = None


async def plan_request(req: AskRequest) -> Plan:
    """후속 질문이면 직전 장소(focus)를 유지하고, 방향어/새 장소 요청이면 새 이야기로 전환한다."""
    ko = req.lang == "ko"
    q = req.question.strip()
    has_direction = direction_from_text(q) is not None
    can_follow = bool(req.focus) and bool(q) and not req.place_id and (
        req.mode == "followup" or (req.mode == "auto" and not has_direction))
    places = await get_provider().nearby(req)
    if can_follow:
        place = next((p for p in places if p.id == req.focus.id), req.focus)  # 움직였다면 최신 거리·방향으로 갱신
        mode = "followup"
    else:
        if not places:
            return Plan(message="근처에서 설명할 만한 장소를 찾지 못했어요. 조금 더 걸어 보세요." if ko
                        else "I couldn't find anything notable nearby. Try walking a bit further.")
        targets = [p for p in places if p.id == req.place_id] if req.place_id else pick_target(places, q)
        if not targets:
            return Plan(message="그 방향에는 눈에 띄는 장소가 없어요." if ko else "There's nothing notable in that direction.",
                        candidates=places[:3])
        place, mode = targets[0], "story"
    plan = Plan(place, [p for p in places if p.id != place.id][:3], mode, candidates=[place])
    history = [t.model_dump() for t in req.history]
    plan.messages = narrator.build_messages(place, q, req.lang, req.persona, plan.neighbors, mode, req.depth, history)
    # 처음 소개(질문 없음/방향 질문/자동 안내)만 캐시. 후속 질문은 매번 새로 생성.
    if mode == "story" and (req.place_id or has_direction or not q):
        plan.cache_key = (place.id, place.direction, req.lang, req.persona, req.depth)
    return plan


@app.post("/api/ask", response_model=Answer)
async def ask(req: AskRequest):
    plan = await plan_request(req)
    if plan.message:
        return Answer(text=plan.message, candidates=plan.candidates, mode=plan.mode)
    text = cache.get(plan.cache_key) if plan.cache_key else None
    if text is None:
        try:
            text = await narrator.narrate(plan.place, req.question, req.lang, req.persona, plan.neighbors,
                                          plan.mode, req.depth, [t.model_dump() for t in req.history])
        except Exception as e:  # 외부 API 장애 시 앱이 멈추지 않도록
            raise HTTPException(502, f"narration failed: {type(e).__name__}") from e
        if plan.cache_key:
            cache.set(plan.cache_key, text)
    return Answer(text=text, place=plan.place, candidates=plan.candidates, mode=plan.mode,
                  follow_ups=narrator.follow_ups(req.lang, plan.mode))


def sse(obj: dict) -> str:
    return "data: " + json.dumps(obj, ensure_ascii=False) + "\n\n"


@app.post("/api/ask/stream")
async def ask_stream(req: AskRequest):
    """문장이 완성되는 즉시 내려보낸다 → 클라이언트가 첫 문장부터 TTS로 읽기 시작.
    이벤트: meta(장소·모드·추천질문) → sentence* → done | error"""
    plan = await plan_request(req)

    async def gen():
        if plan.message:
            yield sse({"type": "meta", "mode": plan.mode, "place": None, "follow_ups": []})
            yield sse({"type": "sentence", "text": plan.message})
            yield sse({"type": "done"})
            return
        yield sse({"type": "meta", "mode": plan.mode, "place": plan.place.model_dump(),
                   "follow_ups": narrator.follow_ups(req.lang, plan.mode)})
        cached = cache.get(plan.cache_key) if plan.cache_key else None
        try:
            if cached is not None:
                for sent in tts.split_sentences(cached, max_len=300):
                    yield sse({"type": "sentence", "text": sent})
            else:
                chunker, full = SentenceChunker(), []
                history = [t.model_dump() for t in req.history]
                async for delta in narrator.narrate_stream(plan.place, req.question, req.lang, req.persona,
                                                           plan.neighbors, plan.mode, req.depth, history):
                    for sent in chunker.feed(delta):
                        full.append(sent)
                        yield sse({"type": "sentence", "text": sent})
                for sent in chunker.flush():
                    full.append(sent)
                    yield sse({"type": "sentence", "text": sent})
                if plan.cache_key and full:
                    cache.set(plan.cache_key, " ".join(full))
        except Exception as e:
            yield sse({"type": "error", "message": type(e).__name__})
        yield sse({"type": "done"})

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/look", response_model=Answer)
async def look(req: LookRequest):
    """카메라 모드: 사진 + 위치/방향 → 무엇을 보고 있는지 특정하고 해설."""
    from . import vlm
    if not vlm.configured():
        raise HTTPException(503, "VLM not configured (set VLM_BASE_URL and VLM_API_KEY)")
    places = await get_provider().nearby(req)
    try:
        text = await vision.look(req.image, places[:5], req.question, req.persona)
    except vision.BadImage as e:
        raise HTTPException(422, str(e)) from e
    except Exception as e:
        raise HTTPException(502, f"vision failed: {type(e).__name__}") from e
    return Answer(text=text, candidates=places[:3])


@app.post("/api/tts")
async def tts_endpoint(req: TtsRequest):
    """텍스트 → 음성. 미설정이면 501 → 클라이언트가 브라우저 TTS로 폴백."""
    if not tts.configured():
        raise HTTPException(501, "TTS not configured")
    if not req.text.strip() or len(req.text) > 600:
        raise HTTPException(422, "text must be 1-600 chars")
    try:
        audio, mime = await tts.synthesize(req.text, req.persona)
    except Exception as e:
        raise HTTPException(502, f"tts failed: {type(e).__name__}") from e
    return Response(audio, media_type=mime, headers={"Cache-Control": "public, max-age=86400"})


# 프런트엔드 정적 서빙 (API 라우트 이후에 마운트)
_web = Path(__file__).resolve().parents[2] / "web"
if _web.exists():
    app.mount("/", StaticFiles(directory=_web, html=True), name="web")
