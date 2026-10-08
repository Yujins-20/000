import pytest
from app.geo import bearing_deg, direction_from_text, direction_of, distance_m, relative_angle


def test_distance_colosseum_to_forum():
    # 콜로세움 ~ 포로 로마노 약 400~600m
    d = distance_m(41.8902, 12.4922, 41.8925, 12.4853)
    assert 500 < d < 700


@pytest.mark.parametrize("lat2,lng2,expected", [(1, 0, 0), (0, 1, 90), (-1, 0, 180), (0, -1, 270)])
def test_bearing_cardinals(lat2, lng2, expected):
    assert bearing_deg(0, 0, lat2, lng2) == pytest.approx(expected, abs=0.5)


def test_relative_wraparound():
    assert relative_angle(10, 350) == pytest.approx(20)
    assert relative_angle(350, 10) == pytest.approx(-20)


@pytest.mark.parametrize("rel,d", [(0, "front"), (44, "front"), (90, "right"), (-90, "left"), (170, "back"), (-170, "back")])
def test_direction(rel, d):
    assert direction_of(rel) == d


def test_facing_north_target_east_is_right():
    b = bearing_deg(0, 0, 0, 0.001)
    assert direction_of(relative_angle(b, 0)) == "right"


@pytest.mark.parametrize("q,d", [("오른쪽 건물 뭐야?", "right"), ("What is the church on the left?", "left"), ("저 앞에 있는 건?", "front"), ("이건 뭐야", None)])
def test_text(q, d):
    assert direction_from_text(q) == d
