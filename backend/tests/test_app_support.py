"""네이티브 앱 지원: 신고 수신, 강제 업데이트 정보, 앱 출처 CORS."""
import json

from fastapi.testclient import TestClient

from app import config
from app.main import app

c = TestClient(app)
OK = {"kind": "inaccurate", "question": "누가 지었어?", "answer": "답변", "place_id": "colosseum", "comment": "연도가 달라요",
      "persona": "funny", "lang": "ko", "app_version": "1.0.0"}


def test_feedback_is_saved_as_jsonl_without_ip():
    assert c.post("/api/feedback", json=OK).json() == {"ok": True}
    c.post("/api/feedback", json={**OK, "kind": "offensive"})
    lines = open(config.FEEDBACK_PATH, encoding="utf-8").read().strip().split("\n")
    rows = [json.loads(x) for x in lines]
    assert [r["kind"] for r in rows] == ["inaccurate", "offensive"]
    assert rows[0]["comment"] == "연도가 달라요" and rows[0]["ts"] > 0
    assert not any("ip" in k.lower() or "host" in k.lower() for k in rows[0])


def test_feedback_validation():
    assert c.post("/api/feedback", json={**OK, "kind": "spam"}).status_code == 422
    assert c.post("/api/feedback", json={**OK, "answer": "x" * 4001}).status_code == 422
    assert c.post("/api/feedback", json={**OK, "comment": "x" * 1001}).status_code == 422


def test_feedback_storage_cap_and_rate_limit(monkeypatch):
    monkeypatch.setattr(config, "FEEDBACK_MAX_BYTES", 200)
    assert c.post("/api/feedback", json=OK).status_code == 503       # 한 건이 상한보다 큼 → 거절, 디스크 보호
    monkeypatch.setattr(config, "FEEDBACK_MAX_BYTES", 10**6)
    monkeypatch.setattr(config, "RATE_LIMIT_FEEDBACK_PER_MIN", 2)
    assert [c.post("/api/feedback", json=OK).status_code for _ in range(3)] == [200, 200, 429]


def test_health_exposes_min_app_version(monkeypatch):
    monkeypatch.setattr(config, "MIN_APP_VERSION", "1.2.0")
    assert c.get("/api/health").json()["min_app_version"] == "1.2.0"


def test_native_app_origins_pass_cors():
    from fastapi import FastAPI
    from app.main import configure_cors
    a = FastAPI()
    a.post("/x")(lambda: {"ok": 1})
    configure_cors(a, "capacitor://localhost,https://localhost")
    for origin in ("capacitor://localhost", "https://localhost"):
        h = {"Origin": origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type"}
        assert TestClient(a).options("/x", headers=h).headers["access-control-allow-origin"] == origin


def test_privacy_page_fills_operator_tokens(monkeypatch):
    monkeypatch.setattr(config, "OPERATOR_NAME", "Acme <Co>")
    monkeypatch.setattr(config, "CONTACT_EMAIL", "privacy@acme.example")
    r = c.get("/privacy.html")
    assert r.status_code == 200 and "{{" not in r.text
    assert "Acme &lt;Co&gt;" in r.text and "privacy@acme.example" in r.text   # 이스케이프됨
    monkeypatch.setattr(config, "OPERATOR_NAME", "")
    assert "운영자 미설정" in c.get("/privacy.html").text


def test_privacy_page_covers_what_the_app_actually_sends():
    import pathlib
    p = (pathlib.Path(__file__).parents[2] / "web" / "privacy.html").read_text()
    for must in ("위치", "사진", "신고", "백그라운드", "회원가입이 없", "Location", "Photos"):
        assert must in p
