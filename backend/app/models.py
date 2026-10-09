from typing import Literal

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


class Turn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=4000)


class AskRequest(Location):
    question: str = Field(default="", max_length=500)
    lang: str = "ko"
    persona: str = "historian"   # narrator.PERSONAS 의 키
    place_id: str | None = None  # 자동 안내처럼 대상이 이미 정해진 경우
    mode: Literal["auto", "story", "followup"] = "auto"
    depth: Literal["rich", "grounded"] = "rich"   # rich: 모델의 배경지식 허용(불확실하면 밝힘)
    history: list[Turn] = Field(default_factory=list, max_length=12)
    focus: Place | None = None   # 직전 답변이 다룬 장소 → 후속 질문의 대상으로 유지


class Answer(BaseModel):
    text: str
    mode: str = "story"
    follow_ups: list[str] = []
    place: Place | None = None
    candidates: list[Place] = []


class LookRequest(Location):
    image: str                    # data:image/jpeg;base64,...
    question: str = ""
    persona: str = "historian"


class TtsRequest(BaseModel):
    text: str
    persona: str = "historian"
