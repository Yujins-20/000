# GPU 서버 배포 가이드 (WalkGuide 백엔드 = GitHub `backend/`)

> 기존에 공개된 WalkGuide 백엔드와 이 저장소의 백엔드는 **API 규격이 다르다.** 이 저장소의 프런트(`web/`)는
> `/api/ask/stream`, `/api/nearby`, `/api/health`, `/api/look`, `/api/tts`를 쓰므로 기존 공개 주소에 프런트만 붙이면 동작하지 않는다.
> 이 저장소의 `backend/`를 **별도 포트**로 띄워야 한다.

## 배치
```
브라우저 ──HTTPS──▶ (터널) ──▶ WalkGuide FastAPI 127.0.0.1:8082  ← web/ 도 같이 서빙(같은 출처, CORS 불필요)
                                    ├─▶ VLM 127.0.0.1:8000/v1   (외부 직접 공개 금지)
                                    └─▶ TTS 127.0.0.1:8091/v1   (외부 직접 공개 금지)
```
| 서비스 | 내부 주소 | 외부 공개 |
|---|---|---|
| Qwen3.8 VLM | `http://127.0.0.1:8000/v1` | **금지** |
| Qwen3-TTS | `http://127.0.0.1:8091/v1` | **금지** |
| 이 저장소 FastAPI | `http://127.0.0.1:8082` | 터널로만 공개 |

기존 WalkGuide 백엔드가 8080을 쓰면 충돌하지 않도록 8082를 쓴다.

## 1. 설치
```bash
cd /home1/irteam
git clone https://github.com/Yujins-20/000.git walkguide-000      # 이미 있으면: git pull --ff-only
cd walkguide-000/backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
```

## 2. 환경파일 (`.env.server`, 깃에 올라가지 않음)
`config.py`는 `.env`를 자동으로 읽지 않고 환경변수만 쓴다. **앱을 import 하기 전에** 주입해야 한다.
키를 손으로 복사하지 말고 스크립트로 만든다(값을 출력하지 않고, 권한 600, 기존 파일은 덮어쓰지 않음):
```bash
GPU_ENV=/home1/irteam/vlm-api/.env bash scripts/make_env_server.sh
```
생성되는 항목: `LLM_PROVIDER=vlm`, `VLM_BASE_URL/KEY/MODEL`, `VLM_REASONING_EFFORT=low`, `TTS_BASE_URL/KEY/MODEL/VOICE/FORMAT`, `PLACES_PROVIDER=wikipedia`, `WIKI_LANG=ko`, `ALLOWED_ORIGINS=`, 요청 제한.
값 변경은 `VLM_BASE_URL=... TTS_VOICE=... bash scripts/make_env_server.sh` 처럼 환경변수로 덮어쓰거나 파일을 직접 편집(`chmod 600` 유지).

## 3. 실행 (127.0.0.1:8082)
```bash
bash scripts/run_server.sh        # ENV_FILE / PORT / PYTHON 으로 변경 가능
curl http://127.0.0.1:8082/api/health
```
정상: `{"ok":true,"llm":"vlm","tts":true,"vision":true,"places":"wikipedia"}`

| 증상 | 원인 |
|---|---|
| `"llm":"mock"` | `VLM_BASE_URL` 또는 `VLM_API_KEY` 미적용 (환경파일을 import 전에 source 했는지) |
| `"tts":false` | `TTS_BASE_URL` 미적용 |
| `"vision":false` | VLM 주소 또는 키 누락 |

## 4. 종단 간 점검
```bash
set -a; source .env.server; set +a
.venv/bin/python scripts/check_vlm.py [/path/to/photo.jpg]     # 텍스트 → (사진) → TTS
```

## 5. HTTPS 공개 (8082만)
```bash
/home/irteam/bin/cloudflared tunnel --url http://127.0.0.1:8082 --no-autoupdate
```
`https://<터널>/index.html`, `/sim.html`, `/api/health`. 프런트와 백엔드가 같은 출처라 CORS가 필요 없다.
**Quick Tunnel 주소는 재시작하면 바뀐다.** 공개 베타에는 Named Tunnel + 고정 도메인을 쓴다.

## 6. 프런트를 다른 도메인(Vercel/Netlify 등)에 둘 때
1. `web/config.js` 에서 `window.WALKGUIDE_API_BASE = 'https://api.example.com';` (코드 수정 없이 이 파일만 바꾼다; 앱·TTS가 모두 이 주소를 쓴다. 시뮬레이터는 화면의 "서버 주소"/`?server=`)
2. 백엔드 환경변수 `ALLOWED_ORIGINS=https://walkguide.example.com` (여러 개는 쉼표) 후 재시작.
GPU 주소·키는 프런트에 절대 넣지 않는다 — 프런트는 항상 WalkGuide 백엔드만 부른다.

## 7. 공개 전 보안
- `/api/ask`, `/api/ask/stream`, `/api/look`, `/api/tts`는 GPU를 쓴다. **IP별 분당 제한이 내장**돼 있다
  (`RATE_LIMIT_ASK_PER_MIN`=20, `RATE_LIMIT_TTS_PER_MIN`=150, 0이면 끔; 초과 시 429+`Retry-After`).
  터널은 루프백으로 접속하므로 `CF-Connecting-IP`/`X-Forwarded-For`는 **피어가 루프백일 때만** 신뢰한다(외부 직접 접속의 헤더 위조 무시).
- 제한은 단일 프로세스 메모리 방식이다. 인스턴스를 늘리거나 정식 공개할 때는 Redis 기반 제한과 사용자 인증을 추가한다.
- 키는 환경파일/비밀관리에만. 채팅·이슈·커밋에 붙여 넣었다면 즉시 회전한다.
- 사용자 사진은 저장하지 않고 base64(≤4MB, jpeg/png/webp)만 받는다.
