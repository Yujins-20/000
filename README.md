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
서버 실행 후 `http://localhost:8000/sim.html` — 지도에서 걷고 회전하며 "오른쪽 건물 뭐야?"를 시험할 수 있습니다. 시뮬레이터는 서버의 LLM·TTS를 사용합니다(키 입력 없음). `https://<서버>/sim.html` 로 열거나 화면의 "서버 주소"에 지정하세요. 서버에 닿지 못하면 샘플 데이터로 대신 답합니다.

## 대화형 해설(스토리 → 후속 질문)
[docs/CONVERSATION.md](docs/CONVERSATION.md) — `POST /api/ask/stream`(SSE), history/focus 기반 멀티턴, `depth=rich|grounded`.
시뮬레이터 동기화: 프롬프트를 바꾸면 `python backend/scripts/sync_sim.py --write` 실행(테스트가 어긋남을 잡아줍니다).

## 모바일 앱 (Android·iOS)
**바로 보기**: `web/app-sim.html`(앱 시뮬레이터 — 폰 틀 안에서 실제 앱 화면 실행, 백그라운드/권한/오프라인 상황 재현). 로컬: `cd web && python3 -m http.server 8777` → `http://localhost:8777/app-sim.html`.
[docs/APP_RELEASE.md](docs/APP_RELEASE.md) — Capacitor 앱(`app/`), 스토어 서류(`docs/store/`), CI(`.github/workflows/mobile.yml`). 실기기 검증과 스토어 계정·서명은 별도 필요.

## 서버 배포
[docs/DEPLOY.md](docs/DEPLOY.md) — GPU 서버에 8082로 띄우고 터널로 공개, `scripts/make_env_server.sh`(키 비출력)·`scripts/run_server.sh`, 별도 프런트 도메인은 `web/config.js`.

## 자체 서버 VLM·TTS
[docs/SERVER_VLM_TTS.md](docs/SERVER_VLM_TTS.md) — `VLM_BASE_URL`/`VLM_API_KEY`(환경변수), 카메라 모드 `/api/look`, 자연스러운 TTS `/api/tts`.

## 무료 API
[docs/PLATFORM_AND_FREE_APIS.md](docs/PLATFORM_AND_FREE_APIS.md) 참고 (`PLACES_PROVIDER=wikipedia`, `LLM_PROVIDER=groq|openrouter`).

## 테스트
`cd backend && python -m pytest`
