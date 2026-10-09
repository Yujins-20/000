"""web/sim.html 의 공유 데이터 블록(프롬프트 템플릿·페르소나·샘플 장소)을 백엔드 정의에서 생성한다.
    python scripts/sync_sim.py          # 어긋났는지 검사 (CI/테스트용, 어긋나면 종료코드 1)
    python scripts/sync_sim.py --write  # sim.html 갱신
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
from app import narrator, places  # noqa: E402

SIM = ROOT / "web" / "sim.html"
PATTERN = re.compile(r"/\*SHARED-BEGIN\*/.*?/\*SHARED-END\*/", re.S)


def shared_block() -> str:
    data = narrator.shared_for_js()
    data["PLACES"] = [{"id": p.id, "name": p.name, "lat": p.lat, "lng": p.lng, "summary": p.summary}
                      for p in places.SAMPLE_PLACES]
    return "/*SHARED-BEGIN*/\nconst SHARED = " + json.dumps(data, ensure_ascii=False, indent=1) + ";\n/*SHARED-END*/"


def main() -> int:
    html = SIM.read_text()
    fresh = PATTERN.sub(lambda _: shared_block(), html)
    if "--write" in sys.argv:
        SIM.write_text(fresh)
        return 0
    return 0 if fresh == html else 1


if __name__ == "__main__":
    sys.exit(main())
