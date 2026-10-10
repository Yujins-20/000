# 모바일 앱 릴리스 가이드 (Android · iOS)

앱은 **Capacitor**로 웹 코드(`web/`)를 감싼 네이티브 앱이다. 백엔드(FastAPI+GPU)는 그대로 쓴다.

```
app/                      Capacitor 프로젝트 (package.json, capacitor.config.json)
 ├─ android/  ios/        네이티브 프로젝트 (생성물을 커밋; 스토어 설정은 scripts/patch-*.mjs 로 멱등 적용)
 ├─ scripts/build-web.mjs  ../web → www 복사 + 빌드 시점 설정(API 주소·버전·운영자 정보) + 릴리스 게이트
 ├─ scripts/patch-android.mjs / patch-ios.mjs   권한·백그라운드 모드·서명·버전·개인정보 매니페스트
 └─ resources/            아이콘·스플래시 원본 (npm run assets 로 플랫폼별 크기 생성)
web/native.js             웹/네이티브 공용 인터페이스 (백그라운드 위치, 음성 인식, 카메라, 백그라운드 HTTP)
```

## 0. 앱 화면을 바로 보는 방법

| 방법 | 어디서 | 무엇을 볼 수 있나 | 한계 |
|---|---|---|---|
| **앱 시뮬레이터(웹)** | 이 저장소의 `web/app-sim.html` (claude.ai 아티팩트 또는 `https://<서버>/app-sim.html`, 로컬은 아래) | 실제 앱 UI·로직을 폰 틀 안에서 실행. 백그라운드 위치/잠금 화면/권한 거부/오프라인/업데이트 필요/iOS·Android 전환을 버튼으로 재현, 어떤 경로(스트리밍 fetch ↔ 네이티브 HTTP)를 탔는지 이벤트 로그로 확인 | 네이티브 플러그인과 서버가 **가짜**(해설은 AI가 아닌 데모 문장). 실제 GPS·잠금화면 오디오·배터리는 못 봄 |
| **Android 에뮬레이터** | 본인 PC의 Android Studio | 실제 Android 앱(WebView + 실제 플러그인 코드), 실제 서버 연결 | 이 개발 환경에서는 불가(SDK 다운로드 차단·KVM 없음) |
| **iOS 시뮬레이터** | Mac의 Xcode | 실제 iOS 앱 | macOS 필요 |
| **실기기** | USB/TestFlight/내부 테스트 | 백그라운드·오디오·배터리까지 전부 | 계정·서명 필요 |

### 앱 시뮬레이터 (웹) — 로컬에서 열기
```bash
cd web && python3 -m http.server 8777        # 또는 백엔드: cd backend && bash scripts/run_server.sh
# 브라우저: http://localhost:8777/app-sim.html
```
사용 순서: 폰 화면 **▶ 시작 → 동의하고 시작** → "앞에 있는 건물 뭐야?" → 추천 질문 칩으로 후속 질문 → 패널에서 **🔒 화면 잠금**을 켜고 **▲ 20m 걷기** 몇 번 → 새 장소에 가까워지면 로그에 `CapacitorHttp /api/ask (백그라운드 경로)` 가 찍힘.
(`?sim=1` 일 때만 `sim-mock.js` 가 가짜 네이티브/서버를 주입한다. 이 파일과 `app-sim.html` 은 앱 빌드에서 제외된다.)

### 실제 에뮬레이터/시뮬레이터 (본인 PC)
```bash
cd app && npm ci
WALKGUIDE_API_BASE=https://api.<도메인> npm run sync:android && npx cap run android   # 에뮬레이터/기기 선택 → 실행
npm run sync:ios && npx cap run ios                                                      # macOS
```
위치 흉내: **Android** — 에뮬레이터 ⋮ → Location 에서 경로/좌표 지정, 또는 `adb emu geo fix 12.4922 41.8902`(경도 위도 순; 콜로세움). **iOS 시뮬레이터** — 메뉴 Features → Location → *City Run* / *Custom Location…*.
백그라운드 확인: 안내를 켠 뒤 홈 버튼/전원 버튼으로 앱을 내리고 위치를 계속 바꿔 보기(실제 잠금화면 오디오는 에뮬레이터에서 신뢰할 수 없으니 실기기로).

## 1. 지금 상태 — 무엇이 검증됐나

| 항목 | 상태 |
|---|---|
| 백엔드 API·신고·요청 제한·개인정보 페이지 | ✅ 자동 테스트 99개 통과 |
| 앱 로직(위치/방향 선택, 버전 비교, 빌드 게이트, 패치 스크립트 멱등성, plist 유효성) | ✅ Node 테스트 20개 + 위 pytest |
| 네이티브 연동 흐름 (가짜 Capacitor 주입 브라우저 테스트 23항목: 백그라운드 위치 시작, 네이티브 음성/카메라, 백그라운드 전환 시 네이티브 HTTP, 권한 거부 UX, 강제 업데이트 배너) | ✅ 통과 — 단, **플러그인 호출 규약을 가짜로 대체**한 테스트 |
| Android 프로젝트 생성·`cap sync`·Gradle 문법 | ✅ (Groovy 컴파일). **실제 빌드는 못 함**: 이 개발 환경에서 Android SDK/AGP 다운로드가 차단됨 → CI(`mobile.yml`)에서 최초 확인 |
| iOS 프로젝트 생성·패치 | ✅ 생성/패치/plist 검증. **Xcode 빌드는 못 함**(macOS 없음) → CI `ios` 잡에서 최초 확인 |
| **실기기 동작** (백그라운드 위치·잠금화면 오디오·네이티브 음성 인식·카메라) | ❌ **미검증 — 스토어 제출 전 필수** (아래 §5 체크리스트) |
| 스토어 계정·서명·제출 | ❌ 계정/키가 필요해 대신할 수 없음 (§3·§4) |

## 2. 먼저 정해야 할 것 (한 번 정하면 바꾸기 어렵다)
1. **앱 ID** — 현재 `app.walkguide.audioguide`. 스토어 등록 후 **영구**. 바꾸려면 `app/capacitor.config.json`의 `appId`, `android/app/build.gradle`의 `namespace`/`applicationId`, iOS `PRODUCT_BUNDLE_IDENTIFIER` 를 함께 바꾸고, 릴리스 빌드는 `CONFIRM_APP_ID=<ID>`로 확인해야 빌드된다(실수 방지 게이트).
2. **운영자 정보** — `OPERATOR_NAME`, `CONTACT_EMAIL` (개인정보처리방침에 표시; 릴리스 빌드는 비어 있으면 실패).
3. **API 고정 도메인(https)** — Quick Tunnel(`*.trycloudflare.com`)·localhost 는 릴리스 빌드에서 거부된다. Cloudflare Named Tunnel 등으로 `https://api.<도메인>` 확보.
4. **개인정보처리방침 URL** — 서버가 `https://api.<도메인>/privacy.html` 로 서빙한다(`OPERATOR_NAME`/`CONTACT_EMAIL` 환경변수). 스토어 등록에 이 URL을 쓴다. 법률 검토를 받을 것(초안).

## 3. 서버 준비 (docs/DEPLOY.md 참고)
```bash
# 앱 웹뷰 출처(CORS)·운영자 정보·최소 버전을 포함해 .env.server 생성
OPERATOR_NAME="회사명" CONTACT_EMAIL=privacy@example.com bash backend/scripts/make_env_server.sh
```
- `ALLOWED_ORIGINS` 기본값 `capacitor://localhost,https://localhost` (iOS/Android 웹뷰 출처). **이미 만든 `.env.server`가 있으면 이 값을 추가**하고 재시작.
- 신고는 `FEEDBACK_PATH`(기본 `feedback.jsonl`)에 쌓인다 — 정기적으로 검토하고 프롬프트·검수본을 개선.
- 구버전 차단이 필요하면 `MIN_APP_VERSION=1.1.0` (그보다 낮은 앱은 "업데이트 필요" 화면).
- 앱은 서버 요청이 많아진다(백그라운드 자동 안내). `RATE_LIMIT_*`를 사용자 규모에 맞게 조정.

## 4. 빌드·서명·제출
### 로컬 개발 빌드
```bash
cd app && npm ci
WALKGUIDE_API_BASE=https://api.<도메인> npm run sync:android   # 또는 sync:ios (macOS)
npx cap open android     # Android Studio (JDK 21)
npx cap open ios         # Xcode
```
### Android
1. **업로드 키 생성**(한 번, 안전하게 보관·백업): `keytool -genkeypair -v -keystore upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000`
2. Play Console에서 앱 생성 → **Play App Signing** 사용(권장: 업로드 키만 우리가 가짐).
3. 서명 빌드: 로컬은 `ANDROID_KEYSTORE_FILE/PASSWORD/KEY_ALIAS/KEY_PASSWORD` 환경변수를 주고 `RELEASE=1 CONFIRM_APP_ID=… WALKGUIDE_API_BASE=… OPERATOR_NAME=… CONTACT_EMAIL=… npm run sync:android && (cd android && ./gradlew bundleRelease)`.
   **CI**: GitHub → Settings → Secrets: `ANDROID_KEYSTORE_BASE64`(`base64 -w0 upload.jks`), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`; Variables: `CONFIRM_APP_ID`, `WALKGUIDE_API_BASE`, `OPERATOR_NAME`, `CONTACT_EMAIL`; Environment `production`(승인자 지정 권장) → Actions → mobile → Run workflow(release 체크).
4. 내부 테스트 트랙에 AAB 업로드 → 실기기 검증 → 비공개/공개 테스트 → 프로덕션. (개인 개발자 계정은 신규 앱에 **비공개 테스트 요건**이 있을 수 있으니 Play Console 안내를 확인.)
5. 양식: `docs/store/DATA_SAFETY.md`, 목록: `docs/store/LISTING.md`, 심사 메모: `docs/store/REVIEW_NOTES.md`.

### iOS
1. Apple Developer Program 가입, App Store Connect에 앱 생성(번들 ID = 앱 ID).
2. macOS에서 `npm run sync:ios` → Xcode에서 Signing & Capabilities의 Team 지정(자동 서명) → Product → Archive → TestFlight 업로드. (CI 자동 배포는 인증서·프로비저닝 비밀 관리가 필요해 포함하지 않았다. Xcode Cloud 또는 Fastlane 권장.)
3. App Privacy(영양 성분표)는 `docs/store/DATA_SAFETY.md`, 앱 안에 이미 `PrivacyInfo.xcprivacy`가 있다.

## 5. 제출 전 실기기 체크리스트 (이 항목들은 제가 검증하지 못했다)
**Android (최소 2기종: 신형 Android 14+ / 구형 Android 9~11)**
- [ ] 최초 시작 → 동의 화면 → 위치 권한 → 알림 권한(Android 13+) 요청 순서가 자연스럽다
- [ ] 안내 시작 후 **화면 잠금 + 주머니에서 10분 이상 걷기**: 알림 표시줄에 "안내 중" 표시, 위치 갱신 지속, 새 장소 접근 시 **자동 안내 음성이 잠금 상태에서도 나온다**
- [ ] 5분 넘게 백그라운드 후에도 해설·TTS 요청이 성공한다(백그라운드 네이티브 HTTP 경로) — 실패하면 `useLegacyBridge`/HTTP 제한 이슈
- [ ] 음성 질문(네이티브 음성 인식), 사진으로 질문(카메라), 권한 거부/"다시 묻지 않음" 후 설정 열기
- [ ] 배터리: 30분 걷기 시 소모량 확인(위치 `distanceFilter` 조정 근거)
**iOS**
- [ ] **"앱 사용 중 허용"**만 줘도 안내를 켠 뒤 화면을 잠그고 걷는 동안 위치/안내가 이어진다(파란 상태 막대). 플러그인이 이후 "항상 허용" 업그레이드를 요청하는 시점·문구가 자연스러운지 확인(Apple은 "항상" 요청에 정당한 사유를 요구한다 — `REVIEW_NOTES.md`)
- [ ] 무음 스위치 ON·잠금화면에서도 안내 음성이 나온다(오디오 세션 `.playback`), 음악 앱 재생 중 안내 시 소리가 잠깐 낮아졌다 복원된다
- [ ] 백그라운드에서 TTS가 data URL 로 재생된다(WKWebView 오디오)
- [ ] 음성 인식·카메라 권한 문구가 자연스럽다
**공통**
- [ ] 서버 연결 불가/오프라인/429/업데이트 필요 화면
- [ ] 신고 → 서버 `feedback.jsonl`에 쌓임
- [ ] 개인정보처리방침 링크(앱 푸터)와 스토어 URL이 같은 내용을 보여 준다

## 6. 알려진 한계 / 다음 단계
- **오프라인**: 도시팩(사전 합성 해설) 없이는 네트워크가 필요하다 (해외 로밍 데이터 문제). 다음 단계의 핵심.
- 사진 질문 뒤 후속 질문은 새 이야기로 넘어간다(`docs/CONVERSATION.md`).
- 구독/결제 없음(무료 베타). 유료화 시 스토어 인앱결제 정책과 수수료를 반영해 설계.
- 요청 제한은 단일 프로세스 메모리 방식, 사용자 인증 없음 → 공개 규모가 커지면 Redis 기반 제한/App Attest·Play Integrity 같은 앱 무결성 검증 검토.
- 백그라운드 위치 플러그인(`@capgo/background-geolocation`, MPL-2.0)·음성 인식(`@capgo/capacitor-speech-recognition`, MPL-2.0)은 메이저 버전이 Capacitor 메이저와 맞아야 한다. 업그레이드 시 함께 올린다.
