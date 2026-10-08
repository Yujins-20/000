from fastapi.testclient import TestClient

from app.main import app

c = TestClient(app)
# 콜로세움 서쪽(포로 방향 아님) 지점에서 동쪽(콜로세움)을 바라봄
ME = {"lat": 41.8902, "lng": 12.4905, "radius_m": 500}


def test_nearby_sorted_and_directional():
    r = c.post("/api/nearby", json={**ME, "heading": 90})
    assert r.status_code == 200
    ps = r.json()
    assert [p["distance_m"] for p in ps] == sorted(p["distance_m"] for p in ps)
    colosseum = next(p for p in ps if p["id"] == "colosseum")
    assert colosseum["direction"] == "front"


def test_ask_direction_question():
    r = c.post("/api/ask", json={**ME, "heading": 90, "question": "앞에 있는 건물 뭐야?"})
    assert r.json()["place"]["direction"] == "front"
    assert r.json()["text"]


def test_ask_turn_around_changes_direction():
    r = c.post("/api/ask", json={**ME, "heading": 270, "question": "뒤에 뭐 있어?"})
    assert r.json()["place"]["direction"] == "back"


def test_ask_empty_direction():
    r = c.post("/api/ask", json={**ME, "radius_m": 20, "heading": 0})
    assert "찾지 못했" in r.json()["text"]


def test_validation():
    assert c.post("/api/nearby", json={"lat": 200, "lng": 0}).status_code == 422


def test_ask_with_explicit_place_id_overrides_direction_pick():
    base = {**ME, "heading": 90, "question": "정면에 있는 곳 설명해줘"}
    nearest = c.post("/api/ask", json=base).json()["place"]["id"]
    other = next(p["id"] for p in c.post("/api/nearby", json={**ME, "heading": 90}).json() if p["id"] != nearest)
    assert c.post("/api/ask", json={**base, "place_id": other}).json()["place"]["id"] == other
