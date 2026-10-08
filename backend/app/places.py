"""장소 제공자. 키가 있으면 Google Places API(New), 없으면 내장 샘플(로마) 사용."""
import httpx

from . import config
from .geo import bearing_deg, direction_of, distance_m, relative_angle
from .models import Location, Place

# 비용 절감을 위해 필요한 필드만 요청
_FIELD_MASK = "places.id,places.displayName,places.location,places.types,places.editorialSummary"
_IGNORE_TYPES = {"restaurant", "cafe", "bar", "lodging", "store", "parking"}

SAMPLE_PLACES = [
    Place(id="colosseum", name="콜로세움", lat=41.89021, lng=12.49223, types=["tourist_attraction"],
          summary="서기 80년경 완공된 로마 최대의 원형 경기장. 약 5만 명을 수용했고 검투사 경기가 열렸다."),
    Place(id="arch_constantine", name="콘스탄티누스 개선문", lat=41.88981, lng=12.49055, types=["monument"],
          summary="315년 밀비우스 다리 전투 승리를 기념해 세운 개선문. 로마에 남은 개선문 중 가장 크다."),
    Place(id="forum", name="포로 로마노", lat=41.89246, lng=12.48531, types=["historical_landmark"],
          summary="고대 로마의 정치·종교·상업 중심지였던 광장 유적."),
    Place(id="san_clemente", name="산 클레멘테 대성당", lat=41.88897, lng=12.49794, types=["church"],
          summary="12세기 성당 아래 4세기 성당, 그 아래 미트라 신전이 겹쳐 있는 3층 구조의 성당."),
    Place(id="palatine", name="팔라티노 언덕", lat=41.88970, lng=12.48750, types=["historical_landmark"],
          summary="로마 건국 전설의 무대이자 황제들의 궁전이 있던 언덕."),
]


def annotate(places: list[Place], loc: Location) -> list[Place]:
    out = []
    for p in places:
        d = distance_m(loc.lat, loc.lng, p.lat, p.lng)
        if d > loc.radius_m:
            continue
        b = bearing_deg(loc.lat, loc.lng, p.lat, p.lng)
        direction = direction_of(relative_angle(b, loc.heading)) if loc.heading is not None else "front"
        out.append(p.model_copy(update={"distance_m": round(d), "bearing": round(b), "direction": direction}))
    return sorted(out, key=lambda p: p.distance_m)


class MockPlaces:
    async def nearby(self, loc: Location) -> list[Place]:
        return annotate(SAMPLE_PLACES, loc)


class GooglePlaces:
    URL = "https://places.googleapis.com/v1/places:searchNearby"

    async def nearby(self, loc: Location) -> list[Place]:
        body = {
            "maxResultCount": 20,
            "rankPreference": "DISTANCE",
            "excludedTypes": sorted(_IGNORE_TYPES),
            "locationRestriction": {"circle": {"center": {"latitude": loc.lat, "longitude": loc.lng},
                                               "radius": float(loc.radius_m)}},
        }
        headers = {"X-Goog-Api-Key": config.GOOGLE_MAPS_API_KEY, "X-Goog-FieldMask": _FIELD_MASK}
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.post(self.URL, json=body, headers=headers)
            r.raise_for_status()
        places = [
            Place(id=p["id"], name=p["displayName"]["text"], lat=p["location"]["latitude"],
                  lng=p["location"]["longitude"], types=p.get("types", []),
                  summary=p.get("editorialSummary", {}).get("text", ""))
            for p in r.json().get("places", [])
        ]
        return annotate(places, loc)


def get_provider():
    return GooglePlaces() if config.GOOGLE_MAPS_API_KEY else MockPlaces()
