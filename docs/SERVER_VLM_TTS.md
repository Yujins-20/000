# 자체 서버 VLM + 자연스러운 TTS

## 1. 구조

```
[브라우저/앱] ──HTTPS──▶ [WalkGuide 백엔드(FastAPI)] ──(Bearer 키, 서버에만 보관)──▶ [GPU 서버]
   │  /api/ask  텍스트 해설                                         ├─ VLM  : OpenAI 호환 /v1/chat/completions (qwen3.8-vl)
   │  /api/look 사진+위치+방향 → 무엇을 보는지 특정 + 해설           └─ TTS  : OpenAI 호환 /v1/audio/speech
   │  /api/tts  문장 → 음성(캐시)
```
- **브라우저가 GPU 서버를 직접 부르지 않는다.** 키가 노출되고, 비용 한도·남용 방어를 걸 곳이 없어진다. 항상 백엔드 경유.
- 백엔드 설정은 환경변수(`backend/.env.example` 참고). `LLM_PROVIDER=auto`면 VLM 설정 > Gemini > mock 순으로 선택.
- VLM 호출은 `chat_template_kwargs.reasoning_effort`를 서버 사양대로 전달한다(기본 `low`: 해설은 지연이 중요). `<think>` 블록은 응답에서 제거한다.

## 2. VLM으로 새로 가능해진 것 — 카메라 모드 (`POST /api/look`)
GPS+나침반만으로는 "저 건물"을 못 맞히는 경우(골목, 높이 차, GPS 오차)가 가장 큰 제품 리스크였다. 사진을 같이 보내면:
1. 백엔드가 위치 기준 후보 장소 최대 5개(근거 요약 포함)를 만들고
2. VLM이 사진의 단서(외관·간판·조각)로 후보 중 무엇인지 판단 → 확신이 낮으면 "아마 ~로 보여요"라고 말하고, 후보에 없으면 보이는 것만 설명
3. 사실(연도·수치)은 후보 근거에서만, 페르소나는 말투에만 적용

입력 검증: `data:image/(jpeg|png|webp);base64`만 허용, 4MB 제한(프런트는 1024px로 축소 후 전송).

## 3. TTS를 자연스럽게 — 5가지 레버

**① 엔진: Qwen3-TTS 계열을 같은 서버에 (OpenAI 호환 `/v1/audio/speech`)**
조사 결과(출처 하단): 한국어 지원, 프리셋 한국어 음성(CustomVoice), 자연어로 목소리를 설계하는 VoiceDesign, 스트리밍(첫 패킷 ~97ms 주장), vLLM-Omni로 서빙 가능. 라이선스·한국어 품질·지연은 **직접 들어보고 측정**해야 한다.

⚠️ **VRAM 주의**: 현재 VLM이 H200에서 약 127GB를 쓴다. TTS에 남는 건 ~14GB 안팎. 0.6B급(커뮤니티 보고 ~3GB)은 들어가지만 1.7B는 빠듯할 수 있다. 필요하면 VLM의 `--gpu-memory-utilization`을 낮추거나(컨텍스트 65k도 해설엔 과함) TTS를 별도 GPU/프로세스로 분리. 모델 하나당 서버 프로세스 하나(CustomVoice와 VoiceDesign은 따로 띄움).

**② 읽기 전 텍스트 정규화** (`app/tts.py: normalize`, 테스트 포함) — TTS가 가장 티 나게 틀리는 부분
- `315년` → "삼백십오 년", `90m` → "구십 미터", `5만 명` → "오만 명", `12세기` → "십이 세기", `BC` → "기원전"
- 고유명사 발음이 흔들리면 `_LEXICON`에 읽는 소리를 추가 (예: 산 클레멘테). 도시팩마다 사전을 두는 것이 좋다.

**③ 문장 단위 스트리밍 재생** (`web/tts.js`) — 체감 지연을 줄이고 문장 사이 호흡이 생긴다
첫 문장이 합성되는 즉시 재생하고, 다음 문장은 재생 중에 미리 받는다. 실패하거나 서버 TTS가 없으면(501/404) 브라우저 음성으로 자동 폴백하며 그 세션에서는 서버를 다시 부르지 않는다. (다음 단계: LLM 응답도 스트리밍해 첫 문장이 나오는 즉시 TTS 호출)

**④ 페르소나 = 목소리 연기** (`VOICE_STYLE`) 
말투(텍스트)와 별개로 TTS에 `instructions`로 연기 지시를 전달: 역사학자는 차분한 중저음, 유머러스는 빠른 템포+쉼, 아이용은 다정하고 느리게 등. VoiceDesign을 쓰면 페르소나마다 고정된 "캐릭터 목소리"를 설계해 일관성을 줄 수 있다. 이게 "유머러스 가이드"를 진짜 다른 사람처럼 들리게 하는 부분이다.
- 서버가 `instructions`를 무시하면 영향 없음. 지원 여부는 사용하는 서빙 구현에 따라 다르니 확인할 것.

**⑤ 오디오 캐시 + 인기 POI 사전 합성** 
같은 문장·목소리·페르소나는 디스크에 캐시(`.tts_cache`)해 GPU를 다시 쓰지 않는다. 인기 관광지는 해설을 미리 생성·합성해 두면 응답이 즉시이고(0ms 합성), 오프라인 도시팩의 재료가 된다.

### 만족도 점검 방법 (A/B)
같은 한국어 문장 세트(존댓말, 숫자·연도, 외래어 지명, 의문문, 농담 반전)를 ① 브라우저 TTS ② Qwen3-TTS 프리셋 ③ VoiceDesign 페르소나로 뽑아 귀로 비교. `backend/scripts/check_vlm.py`가 샘플 1건을 저장한다.

## 3.5 시뮬레이터·앱을 실제 서버에 연결하기
시뮬레이터(`web/sim.html`)는 이제 **서버의 LLM·TTS만 사용**한다(브라우저에 키 입력 없음). 해설은 `/api/ask/stream`, 음성은 `/api/tts`.
- **가장 간단: 서버가 직접 서빙** — 백엔드는 `web/`을 정적으로 서빙하므로 `https://<서버주소>/sim.html`(앱은 `/index.html`)로 열면 같은 출처라 설정이 필요 없다.
- **다른 주소에서 열 때**: 화면의 "서버 주소"에 서버 URL을 넣고(또는 `sim.html?server=https://...`), 서버 환경변수 `ALLOWED_ORIGINS`에 그 화면의 출처를 추가(개발 중엔 `*` 가능)한 뒤 백엔드를 재시작. 이 API는 쿠키 인증을 쓰지 않으므로 CORS가 열려도 GPU 키는 노출되지 않는다.
- 연결하면 `/api/health`로 어떤 엔진이 켜졌는지(LLM 종류, TTS, VLM) 화면에 표시한다(주소·키는 노출 안 함). LLM이 `mock`이면 서버에 VLM 환경변수가 안 들어간 것이다.
- 서버에 닿지 못하면 샘플 데이터로 대신 답하고 "서버 없음"으로 표시한다.
- 서버에 이 브랜치의 코드가 배포돼 있어야 한다(`/api/ask/stream`, `/api/health` 상세 응답 포함).

## 4. 운영·보안 체크리스트
- 🔑 **키가 대화/채팅 로그에 노출됐다면 즉시 회전**하세요. 키는 환경변수·비밀관리에만 두고 저장소·프런트엔드·로그에 넣지 않는다. (이 저장소에는 키를 넣지 않았다.)
- Cloudflare **Quick Tunnel 주소는 재시작 시 바뀌고 uptime 보장이 없다.** 공개 베타 전에 Named Tunnel + 고정 도메인으로. 백엔드는 주소를 `VLM_BASE_URL` 환경변수로만 참조하므로 교체가 쉽다.
- `/api/look`, `/api/tts`, `/api/ask`는 GPU 비용이 든다 → 공개 전 IP/세션별 레이트 리밋과 일일 한도 필요(미구현).
- 외부 이미지 URL은 받지 않고 base64만 받는다(SSRF 방지). 사용자 사진은 저장하지 않는다.
- VLM이 죽었을 때: `/api/ask`는 502, 클라이언트는 오류 표시. (다음 단계: Gemini/Groq 폴백 체인)

## 5. 점검
```bash
cd backend
export VLM_BASE_URL=https://<host>/v1 VLM_API_KEY=...      # 셸 환경변수로만
python scripts/check_vlm.py [photo.jpg]                     # 텍스트 → 이미지 → TTS
```

## Sources
- [Qwen3-TTS vLLM recipe (OpenAI 호환 /v1/audio/speech, 스트리밍)](https://recipes.vllm.ai/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice)
- [Qwen3-TTS on vLLM-Omni](https://bezzam-evals-voxtral.hf.space/vllm-omni/recipes/Qwen/Qwen3-TTS.md)
- [Qwen3-TTS 개요 (10개 언어, 한국어 포함)](https://gaga.art/blog/qwen3-tts/)
- [Open Source TTS Guide 2026](https://tts.ai/blog/open-source-text-to-speech-guide-2026/?lang=ko)
- [CosyVoice2 KO SFT (커뮤니티 한국어 파인튜닝)](https://huggingface.co/sonselfa/CosyVoice2-KO-SFT-v6-epoch3)
