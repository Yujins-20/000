import asyncio
import base64

import pytest
from fastapi.testclient import TestClient

from app import config, narrator, tts, vision, vlm
from app.main import app
from app.models import Place

c = TestClient(app)
JPEG = "data:image/jpeg;base64," + base64.b64encode(b"\xff\xd8\xff fake").decode()


# ---------- 정규화 ----------
@pytest.mark.parametrize("n,s", [(0, "영"), (5, "오"), (10, "십"), (12, "십이"), (80, "팔십"), (315, "삼백십오"),
                                 (1000, "천"), (2024, "이천이십사"), (10000, "만"), (50000, "오만"), (123456, "십이만삼천사백오십육")])
def test_sino(n, s):
    assert tts.sino(n) == s


def test_normalize_numbers_and_units():
    assert tts.normalize("315년 완공, 90m 앞") == "삼백십오 년 완공, 구십 미터 앞"
    assert tts.normalize("5만 명 수용, 12세기 성당") == "오만 명 수용, 십이 세기 성당"
    assert tts.normalize("기원전 509년 BC") == "기원전 오백구 년 기원전"
    assert tts.normalize("첫 줄\n둘째 줄") == "첫 줄. 둘째 줄"


def test_split_sentences():
    assert tts.split_sentences("하나입니다. 둘이에요! 셋인가요?") == ["하나입니다.", "둘이에요!", "셋인가요?"]
    long = "가나다라 " * 40
    assert all(len(s) <= 81 for s in tts.split_sentences(long))


# ---------- VLM ----------
def test_vlm_clean_strips_think():
    assert vlm.clean("<think>음...</think> 안녕") == "안녕"
    assert vlm.clean("<think>끝나지 않은 생각") == ""


def test_vlm_body_has_reasoning_effort(monkeypatch):
    monkeypatch.setattr(config, "VLM_REASONING_EFFORT", "low")
    b = vlm.build_body([{"role": "user", "content": "hi"}], 100, 0.5)
    assert b["model"] == config.VLM_MODEL and b["chat_template_kwargs"] == {"reasoning_effort": "low"}


def test_llm_auto_prefers_vlm(monkeypatch):
    monkeypatch.setattr(config, "LLM_PROVIDER", "auto")
    monkeypatch.setattr(config, "VLM_BASE_URL", "https://x/v1")
    monkeypatch.setattr(config, "VLM_API_KEY", "k")
    assert narrator.resolve_provider() == "vlm"


def test_narrate_via_vlm(monkeypatch):
    async def fake_chat(messages, max_tokens=500, temperature=0.7):
        assert "[페르소나]" in messages[0]["content"]
        return "VLM 해설"
    monkeypatch.setattr(config, "LLM_PROVIDER", "vlm")
    monkeypatch.setattr(vlm, "chat", fake_chat)
    p = Place(id="a", name="A", lat=0, lng=0, distance_m=10)
    assert asyncio.run(narrator.narrate(p, "", "ko", "funny", [])) == "VLM 해설"


# ---------- 비전 ----------
def test_validate_image_rejects_bad_input(monkeypatch):
    for bad in ["http://evil/x.jpg", "data:text/html;base64,AAAA", "data:image/svg+xml;base64,AAAA", "data:image/jpeg;base64,@@@"]:
        with pytest.raises(vision.BadImage):
            vision.validate_image(bad)
    monkeypatch.setattr(config, "MAX_IMAGE_BYTES", 4)
    with pytest.raises(vision.BadImage):
        vision.validate_image(JPEG)


def test_vision_messages_include_image_candidates_and_persona():
    cand = [Place(id="a", name="콜로세움", lat=0, lng=0, summary="경기장", distance_m=30, direction="left")]
    m = vision.build_messages(JPEG, cand, "", "funny")[0]["content"]
    assert m[0]["type"] == "image_url" and m[0]["image_url"]["url"] == JPEG
    assert "콜로세움 (사용자 기준 왼쪽, 30m): 경기장" in m[1]["text"] and narrator.PERSONAS["funny"]["style"] in m[1]["text"]


def test_api_look(monkeypatch):
    body = {"lat": 41.8902, "lng": 12.4905, "heading": 90, "radius_m": 500, "image": JPEG}
    monkeypatch.setattr(config, "VLM_BASE_URL", "")
    assert c.post("/api/look", json=body).status_code == 503

    async def fake_look(image, cands, q, persona):
        assert cands and image == JPEG
        return "사진 속은 콜로세움"
    monkeypatch.setattr(config, "VLM_BASE_URL", "https://x/v1")
    monkeypatch.setattr(config, "VLM_API_KEY", "k")
    monkeypatch.setattr(vision, "look", fake_look)
    assert c.post("/api/look", json=body).json()["text"] == "사진 속은 콜로세움"
    assert c.post("/api/look", json={**body, "image": "http://x"}).status_code in (422, 502)


# ---------- TTS ----------
def test_api_tts_unconfigured_is_501(monkeypatch):
    monkeypatch.setattr(config, "TTS_BASE_URL", "")
    assert c.post("/api/tts", json={"text": "안녕"}).status_code == 501


def test_api_tts_and_cache(monkeypatch, tmp_path):
    calls = []

    class R:
        content = b"AUDIO"
        def raise_for_status(self): pass

    class C:
        async def __aenter__(self): return self
        async def __aexit__(self, *a): pass
        async def post(self, url, json, headers):
            calls.append((url, json, headers)); return R()

    monkeypatch.setattr(tts.httpx, "AsyncClient", lambda **kw: C())
    monkeypatch.setattr(config, "TTS_BASE_URL", "http://tts/v1")
    monkeypatch.setattr(config, "TTS_MODEL", "qwen3-tts")
    monkeypatch.setattr(config, "TTS_VOICE", "sohee")
    monkeypatch.setattr(config, "TTS_CACHE_DIR", str(tmp_path))
    for _ in range(2):
        r = c.post("/api/tts", json={"text": "315년에 지었어요.", "persona": "funny"})
        assert r.status_code == 200 and r.content == b"AUDIO" and r.headers["content-type"] == "audio/mpeg"
    assert len(calls) == 1  # 두 번째는 캐시
    url, body, _ = calls[0]
    assert url == "http://tts/v1/audio/speech" and body["input"] == "삼백십오 년에 지었어요." and body["voice"] == "sohee"
    assert tts.VOICE_STYLE["funny"] == body["instructions"]
    assert c.post("/api/tts", json={"text": "x" * 601}).status_code == 422
