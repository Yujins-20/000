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
          summary="플라비우스 왕조의 베스파시아누스 황제 때인 서기 70년대 초에 공사를 시작해, 아들 티투스가 서기 80년에 개장한 로마 최대의 원형 경기장입니다. "
                  "정식 이름은 플라비우스 원형경기장이고, '콜로세움'이라는 이름은 근처에 있던 네로 황제의 거대한 동상(콜로소)에서 왔다는 설이 널리 받아들여집니다. "
                  "타원형 평면은 길이 약 190m, 높이는 약 50m에 이르고, 수용 인원은 추정이 갈리지만 5만 명 안팎으로 봅니다. "
                  "개장 기념 경기는 100일 동안 이어졌다고 전해집니다. 지하에는 맹수와 검투사가 대기하던 공간과 승강 장치가 있었고, 햇빛을 가리는 거대한 천막 지붕은 선원들이 조작했다고 알려져 있습니다. "
                  "중세에는 요새와 석재 채석장으로도 쓰였고, 지진과 약탈로 외벽 일부가 무너져 지금의 모습이 되었습니다."),
    Place(id="arch_constantine", name="콘스탄티누스 개선문", lat=41.88981, lng=12.49055, types=["monument"],
          summary="서기 315년에 봉헌된, 로마에 남은 개선문 중 가장 큰 문입니다. 312년 밀비우스 다리 전투에서 콘스탄티누스 황제가 막센티우스를 이긴 것을 기념해 원로원이 세웠습니다. "
                  "높이는 약 21m이고 통로가 세 개입니다. 이 문의 흥미로운 점은 조각 상당수를 트라야누스·하드리아누스·마르쿠스 아우렐리우스 시대의 오래된 기념물에서 가져다 다시 썼다는 것입니다. "
                  "그래서 같은 문에 다른 시대의 조각 양식이 섞여 있습니다. 개선 행렬이 콜로세움 옆을 지나 포로 로마노로 향하던 길목에 서 있습니다."),
    Place(id="forum", name="포로 로마노", lat=41.89246, lng=12.48531, types=["historical_landmark"],
          summary="팔라티노 언덕과 카피톨리노 언덕 사이의 골짜기에 있던 고대 로마의 중심 광장입니다. 원래는 습지에 가까웠는데 배수 시설(클로아카 막시마)로 말려 시장과 집회 장소가 되었다고 전해집니다. "
                  "원로원 의사당(쿠리아), 사투르누스 신전, 신성한 길(비아 사크라), 티투스와 셉티미우스 세베루스의 개선문 등이 모여 있었습니다. "
                  "로마가 쇠퇴하면서 땅 아래 묻혀 중세에는 소를 풀어 먹이던 곳이라 '캄포 바키노(소 들판)'로 불렸고, 본격적인 발굴은 18~19세기 이후에 진행되었습니다."),
    Place(id="san_clemente", name="산 클레멘테 대성당", lat=41.88897, lng=12.49794, types=["church"],
          summary="12세기 초에 지어진 성당 아래에 4세기 성당이 있고, 그 아래에는 1세기 건물들과 미트라 신전이 겹쳐 있는 3층 구조의 성당입니다. "
                  "위층에는 12세기 모자이크가 있고, 아래층에는 초기 기독교 시대의 프레스코와 이탈리아어 속어가 적힌 오래된 낙서가 남아 있다고 알려져 있습니다. "
                  "가장 아래층에서는 지하수가 흐르는 소리가 들린다고 해서, 시간을 거슬러 내려가는 느낌을 주는 곳으로 유명합니다."),
    Place(id="palatine", name="팔라티노 언덕", lat=41.88970, lng=12.48750, types=["historical_landmark"],
          summary="로마 7개 언덕 중 가장 중심이 되는 언덕으로, 기원전 753년에 로물루스가 도시를 세웠다는 건국 전설의 무대입니다. "
                  "공화정 시대에는 부유한 귀족들이, 제정 시대에는 황제들이 궁전을 지었고, 영어의 '팰리스(궁전)'라는 단어가 이 언덕 이름 '팔라티움'에서 나왔다고 설명합니다. "
                  "아우구스투스의 집과 도미티아누스 황제의 궁전 터가 남아 있고, 언덕 위에서는 포로 로마노와 키르쿠스 막시무스 방향이 내려다보입니다."),
    Place(id="meta_sudans", name="메타 수단스 터", lat=41.88983, lng=12.49113, types=["historical_landmark"],
          summary="콜로세움과 콘스탄티누스 개선문 사이에 있던 원뿔형 분수의 터입니다. 이름은 '땀 흘리는 반환점'이라는 뜻으로, 원뿔 꼭대기에서 물이 흘러내리는 모습에서 붙었다고 전해집니다. "
                  "서기 1세기 말 플라비우스 왕조 때 만들어졌고, 1930년대 도로 정비 과정에서 철거되어 지금은 둥근 터만 남아 있습니다."),
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


class WikipediaPlaces:
    """무료·키 불필요. 위키백과 GeoSearch로 '이야깃거리가 있는' 랜드마크만 가져오고 요약문을 근거로 쓴다."""

    async def nearby(self, loc: Location) -> list[Place]:
        params = {
            "action": "query", "format": "json", "generator": "geosearch",
            "ggscoord": f"{loc.lat}|{loc.lng}", "ggsradius": max(10, min(loc.radius_m, 10000)),
            "ggslimit": 20, "prop": "coordinates|extracts", "exintro": 1, "explaintext": 1,
            "exlimit": "max", "colimit": "max",
        }
        url = f"https://{config.WIKI_LANG}.wikipedia.org/w/api.php"
        async with httpx.AsyncClient(timeout=10, headers={"User-Agent": "WalkGuide/0.1 (prototype)"}) as c:
            r = await c.get(url, params=params)
            r.raise_for_status()
        return annotate(parse_wikipedia(r.json()), loc)


def clip(text: str, limit: int = 1500) -> str:
    """위키 도입부는 길 수 있어 문장 경계에서 자른다 (프롬프트 비용 보호)."""
    if len(text) <= limit:
        return text
    cut = max(text.rfind(". ", 0, limit), text.rfind("。", 0, limit))
    return text[:cut + 1] if cut > limit // 2 else text[:limit]


def parse_wikipedia(data: dict) -> list[Place]:
    out = []
    for pg in data.get("query", {}).get("pages", {}).values():
        co = (pg.get("coordinates") or [None])[0]
        if not co:
            continue
        out.append(Place(id=f"wiki:{pg['pageid']}", name=pg["title"], lat=co["lat"], lng=co["lon"],
                         types=["wikipedia"], summary=clip(pg.get("extract", "").strip())))
    return out


def get_provider():
    kind = config.PLACES_PROVIDER
    if kind == "auto":
        kind = "google" if config.GOOGLE_MAPS_API_KEY else "mock"
    return {"google": GooglePlaces, "wikipedia": WikipediaPlaces}.get(kind, MockPlaces)()
