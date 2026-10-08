# 워크가이드 — 위치 기반 AI 오디오 도슨트

기획·사업화: [docs/PRODUCT.md](docs/PRODUCT.md)

## 실행
```bash
cd backend && pip install -r requirements.txt
# (선택) 실제 데이터: export GOOGLE_MAPS_API_KEY=... GEMINI_API_KEY=...
uvicorn app.main:app --reload --host 0.0.0.0
```
키가 없으면 로마 샘플 장소 + 템플릿 해설(mock)로 동작합니다. 
휴대폰의 GPS/나침반/마이크는 HTTPS가 필요하므로 배포하거나 ngrok 등으로 터널링하세요.

## 시뮬레이션 (GPS 없이 테스트)
서버 실행 후 `http://localhost:8000/sim.html` — 지도에서 걷고 회전하며 "오른쪽 건물 뭐야?"를 시험할 수 있습니다. 서버 없이 파일만 열어도 로컬 모드로 동작합니다.

## 자체 서버 VLM·TTS
[docs/SERVER_VLM_TTS.md](docs/SERVER_VLM_TTS.md) — `VLM_BASE_URL`/`VLM_API_KEY`(환경변수), 카메라 모드 `/api/look`, 자연스러운 TTS `/api/tts`.

## 무료 API
[docs/PLATFORM_AND_FREE_APIS.md](docs/PLATFORM_AND_FREE_APIS.md) 참고 (`PLACES_PROVIDER=wikipedia`, `LLM_PROVIDER=groq|openrouter`).

## 테스트
`cd backend && python -m pytest`
