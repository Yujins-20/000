"""서버 연결 점검: 텍스트 → (선택) 이미지 → (선택) TTS.  사용법:
    export VLM_BASE_URL=https://.../v1  VLM_API_KEY=...   # 키는 셸 환경변수로만
    python scripts/check_vlm.py [image.jpg]
"""
import asyncio
import base64
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import tts, vision, vlm  # noqa: E402
from app.models import Place  # noqa: E402


async def main():
    if not vlm.configured():
        sys.exit("VLM_BASE_URL / VLM_API_KEY 환경변수를 설정하세요.")
    t = time.time()
    print("텍스트:", await vlm.chat([{"role": "user", "content": "콜로세움을 유머러스하게 두 문장으로 소개해줘."}], 200),
          f"({time.time() - t:.1f}s)")
    if len(sys.argv) > 1:
        img = "data:image/jpeg;base64," + base64.b64encode(Path(sys.argv[1]).read_bytes()).decode()
        cand = [Place(id="x", name="(후보 예시)", lat=0, lng=0, summary="", distance_m=30, direction="front")]
        t = time.time()
        print("이미지:", await vision.look(img, cand, "", "historian"), f"({time.time() - t:.1f}s)")
    if tts.configured():
        t = time.time()
        audio, mime = await tts.synthesize("315년에 세워진 개선문입니다. 정면 90미터 앞이에요.", "funny")
        Path("tts_check.mp3" if "mpeg" in mime else "tts_check.wav").write_bytes(audio)
        print(f"TTS: {len(audio)} bytes 저장 ({time.time() - t:.1f}s)")


asyncio.run(main())
