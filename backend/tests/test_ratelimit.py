from types import SimpleNamespace

from fastapi.testclient import TestClient

from app import config, ratelimit
from app.main import app

c = TestClient(app)
ME = {"lat": 41.8902, "lng": 12.4905, "radius_m": 500, "heading": 90}


def req(peer, **headers):
    return SimpleNamespace(client=SimpleNamespace(host=peer), headers=headers)


def test_sliding_window():
    w = ratelimit.SlidingWindow(window_s=60)
    assert [w.check("a", 2, now=t) for t in (0, 1)] == [0, 0]
    assert w.check("a", 2, now=2) == 58          # 3번째는 거절, 첫 요청이 빠질 때까지 대기
    assert w.check("b", 2, now=2) == 0            # 다른 키는 독립
    assert w.check("a", 2, now=61) == 0           # 윈도우가 지나면 다시 허용


def test_client_ip_trusts_forward_headers_only_from_loopback():
    assert ratelimit.client_ip(req("127.0.0.1", **{"cf-connecting-ip": "9.9.9.9"})) == "9.9.9.9"
    assert ratelimit.client_ip(req("::1", **{"x-forwarded-for": "8.8.8.8, 10.0.0.1"})) == "8.8.8.8"
    assert ratelimit.client_ip(req("127.0.0.1")) == "127.0.0.1"
    assert ratelimit.client_ip(req("203.0.113.5", **{"cf-connecting-ip": "1.1.1.1"})) == "203.0.113.5"  # 위조 무시


def test_ask_endpoints_limited_per_ip(monkeypatch):
    monkeypatch.setattr(config, "RATE_LIMIT_ASK_PER_MIN", 2)
    assert [c.post("/api/ask", json=ME).status_code for _ in range(2)] == [200, 200]
    r = c.post("/api/ask/stream", json=ME)        # ask 그룹을 공유
    assert r.status_code == 429 and int(r.headers["retry-after"]) >= 1
    assert c.post("/api/nearby", json=ME).status_code == 200   # 비용 없는 엔드포인트는 제한 없음
    assert c.get("/api/health").status_code == 200


def test_tts_has_its_own_budget(monkeypatch):
    monkeypatch.setattr(config, "RATE_LIMIT_ASK_PER_MIN", 1)
    monkeypatch.setattr(config, "RATE_LIMIT_TTS_PER_MIN", 1)
    monkeypatch.setattr(config, "TTS_BASE_URL", "")
    assert c.post("/api/ask", json=ME).status_code == 200
    assert c.post("/api/tts", json={"text": "안녕"}).status_code == 501   # 제한 통과(미설정이라 501)
    assert c.post("/api/tts", json={"text": "안녕"}).status_code == 429
    assert c.post("/api/ask", json=ME).status_code == 429
