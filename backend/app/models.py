from pydantic import BaseModel, Field


class Place(BaseModel):
    id: str
    name: str
    lat: float
    lng: float
    types: list[str] = []
    summary: str = ""          # 장소 제공자/위키가 준 근거 텍스트
    distance_m: float = 0
    bearing: float = 0
    direction: str = "front"   # front/right/back/left


class Location(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    heading: float | None = Field(default=None, ge=0, le=360)  # 북쪽 기준 시계방향
    radius_m: int = Field(default=150, ge=20, le=1000)


class AskRequest(Location):
    question: str = ""
    lang: str = "ko"
    persona: str = "historian"   # narrator.PERSONAS 의 키
    place_id: str | None = None  # 자동 안내처럼 대상이 이미 정해진 경우


class Answer(BaseModel):
    text: str
    place: Place | None = None
    candidates: list[Place] = []
