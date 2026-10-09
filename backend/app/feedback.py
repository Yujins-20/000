"""사용자 신고 저장(JSON Lines). 스토어 정책상 AI 생성 콘텐츠는 앱 안에서 신고할 수 있어야 한다."""
import json
import threading
import time
from pathlib import Path

from . import config
from .models import FeedbackRequest

_lock = threading.Lock()


class FeedbackFull(Exception):
    pass


def save(fb: FeedbackRequest) -> None:
    path = Path(config.FEEDBACK_PATH)
    line = json.dumps({"ts": int(time.time()), **fb.model_dump()}, ensure_ascii=False) + "\n"
    with _lock:
        size = path.stat().st_size if path.exists() else 0
        if size + len(line.encode()) > config.FEEDBACK_MAX_BYTES:
            raise FeedbackFull()  # 디스크 보호: 상한을 넘으면 거절(운영자가 비우거나 상한을 올린다)
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as fh:
            fh.write(line)
