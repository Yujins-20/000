# 웹 vs 앱, 그리고 무료 API 조사

## 1. 웹(PWA)으로 시작할까, 앱으로 시작할까 — 초기 사업단계 판단

**결론: 웹(PWA)으로 시작하고, 아래 "전환 신호"가 확인되면 같은 웹 코드를 Capacitor로 감싼 앱을 낸다. 처음부터 네이티브로 가지 않는다.**

### 왜 지금은 웹인가 (초기 사업단계의 질문은 "앱을 만들 수 있나"가 아니라 "쓰고 돈 낼 사람이 있나")
| 초기 단계의 필요 | 웹(PWA) | 네이티브 앱 |
|---|---|---|
| 가설 검증 속도 | 링크 1개로 배포·수정 즉시 반영(우리 서버 구조상 프런트 수정 = 새로고침) | 스토어 심사 대기, 수정마다 재배포 |
| 첫 사용 마찰 | 링크/QR 클릭 → 바로 사용 (여행자가 해외에서 앱 설치·가입 안 해도 됨) | 스토어 검색·다운로드·권한 |
| 유통 | 유적지 QR, 호텔·호스텔 데스크, 여행 커뮤니티 글 링크, B2B(관광청·박물관)에 "링크 하나"로 시연 | 스토어 노출에 의존 |
| 결제 | Stripe 등 자체 결제(수수료 낮음) | 인앱결제 15~30% |
| 비용 | 하나의 코드 | iOS/Android 심사·유지 |
| 학습 속도 | 유입 → 질문 수 → 후속 질문 비율 같은 지표를 서버에서 바로 | 설치 퍼널이 끼어 데이터가 흐려짐 |

우리는 이미 서버(VLM·TTS)가 GPU 한 대이므로 **초기 사용자 규모는 어차피 소규모**다. 스토어 유통의 장점(대규모 노출)을 지금 쓸 수 없고, 단점(느린 반복)만 안게 된다.

### 웹의 진짜 약점 (조사 기반, 반드시 실기기 테스트)
이 서비스의 이상적인 사용은 "주머니에 폰, 귀에 이어폰, 걸으며 대화"다. 웹이 여기서 약하다.
- **화면 꺼진 상태의 오디오**: 설치형(홈 화면) 웹앱에서 잠금화면 오디오가 끊긴다는 보고가 있고(2019 WebKit 이슈, 2024 Apple 포럼) 해결 확인은 못 찾았다. 일반 Safari 탭에서는 계속 재생된다는 보고가 있다.
- **백그라운드 위치**: Geolocation은 지원되지만 화면이 잠기면 갱신이 멈출 수 있어 "화면 켜두기"가 우회책이다. Screen Wake Lock은 iOS 16.4에서 도입됐고 홈 화면 앱에서의 버그는 iOS 18.4에서 고쳐졌다는 자료가 있으나(출처 간 표현 상이), 앱이 백그라운드로 가면 해제되므로 근본 해결이 아니다.
- 그 외: iOS 나침반은 권한 팝업 필요, 브라우저 음성 인식(STT)은 환경별 편차.
→ **현재 사용 시나리오를 "화면을 켜고 걷거나, 유적지에서 멈춰 서서 듣고 묻기"로 정의**하면 웹으로 충분히 검증된다. 주머니 속 완전 핸즈프리는 2단계(앱)의 약속으로 둔다.

### 웹 단계에서 같이 하면 좋은 것 (저비용)
Screen Wake Lock(세션 중 화면 유지), Media Session(잠금화면 컨트롤·재생 지속 시도), 홈 화면 설치 안내와 아이콘, 오프라인 캐시(도시팩은 6단계). — 요청하시면 구현합니다.

### 앱으로 전환하는 신호 (정량 기준을 미리 정해 둔다)
아래 중 **둘 이상**이 충족되면 Capacitor 앱을 시작한다.
1. 베타 사용자 피드백/로그에서 "화면 끄면 멈춘다"가 상위 불만이거나, 화면 꺼짐으로 세션이 끊기는 비율이 높다.
2. 7일 재방문(D7)이 목표선(예: 20%+)을 넘는데 이탈 사유가 위 한계다.
3. 유료 전환 의향이 확인됐고(예: 유료 전환 3%+), 오프라인 도시팩·백그라운드 안내가 결제 이유로 확인됐다.
4. B2B 파트너가 "스토어에 있는 앱"을 계약 조건으로 요구한다.

### 앱 단계의 현실 (미리 알아둘 것)
- **Capacitor**로 웹 코드를 재사용하고 백그라운드 위치 플러그인을 붙이는 것이 가장 싸다(예: Cap-go/Capawesome 계열 플러그인; 정확도·유지 상태는 비교 필요). 백엔드(FastAPI)는 그대로 쓴다.
- iOS 백그라운드 위치는 **App Review에서 사용 사유를 소명**해야 하고(심사 노트·눈에 띄는 기능), 백그라운드 세션은 앱이 포그라운드일 때 시작해야 한다. 얇은 웹뷰 래퍼가 최소 기능 심사를 통과하는지는 Apple 지침으로 확인해야 한다.
- 구독 결제는 스토어 수수료(15~30%)와 정책을 고려해 가격을 다시 짠다.

### 정리: 단계별 로드맵
| 단계 | 형태 | 목표 |
|---|---|---|
| 0~2개월 | PWA (현재) + Wake Lock/Media Session | 해설 품질·방향 정확도·후속 질문 사용성 검증, 지인·커뮤니티 베타 |
| 2~4개월 | PWA + QR/링크 유통, 가격 실험(웹 결제) | 유료 전환 의향, B2B 시범 1~2곳 |
| 전환 신호 충족 시 | Capacitor 앱(웹 코드 재사용) | 백그라운드 위치·잠금화면 오디오·오프라인 도시팩 |
| 이후 | 필요한 부분만 네이티브 모듈화 | 규모 확대 |

### Sources
- [iOS PWA Compatibility (firt.dev)](https://firt.dev/notes/pwa-ios/)
- [Screen Wake Lock — PWA capabilities (Progressier)](https://progressier.com/pwa-capabilities/screen-wake-lock)
- [WebKit bug 198277 — 스탠드얼론 웹앱에서 오디오가 백그라운드에서 멈춤](https://bugs.webkit.org/show_bug.cgi?id=198277)
- [Apple Developer Forums — iOS 잠금화면 오디오 문제(PWA)](https://developer.apple.com/forums/thread/762582)
- [WebKit bug 254545 — 홈 화면 앱에서 Wake Lock](https://webkit.org/b/254545)
- [Capacitor 백그라운드 위치 플러그인 (Cap-go)](https://github.com/Cap-go/capacitor-background-geolocation)
- [Capawesome Background Geolocation](https://capawesome.io/docs/sdks/capacitor/background-geolocation/)
- [Why iOS stops background location updates (Capgo)](https://capgo.app/blog/why-ios-stops-background-location-updates-capacitor/)
- [PWA vs Native vs React Native: 2026 Decision Framework](https://www.buildmvpfast.com/blog/pwa-vs-native-vs-react-native-solo-founder-decision-2026)

## 2. 무료로 쓸 수 있는 API

> ⚠️ 아래 한도 수치는 서드파티 블로그 기반이며 출처 간 불일치가 있습니다. 쓰기 전에 각 공급자 공식 페이지에서 확인하세요. 무료 티어는 예고 없이 바뀝니다.

### LLM (해설 생성) — 이 저장소에서 `LLM_PROVIDER`로 전환
| 공급자 | 무료 내용 | 비고 |
|---|---|---|
| Gemini (AI Studio) | Flash / Flash-Lite 무료 티어 (Pro는 유료 전환 보도 있음). 한도는 AI Studio 콘솔에서만 확인 | 무료 티어 입력은 Google 제품 개선에 쓰일 수 있음 |
| **Groq** | 모델별 분당 ~30회, 일 1,000~14,400회(모델마다 다름) | 매우 빠름 → 음성 응답 지연 최소. 기본 `llama-3.3-70b-versatile` |
| **OpenRouter** | `:free` 모델 다수, 분당 ~20회·일 ~50회 수준(크레딧 구매 시 상향 보도) | 키 하나로 여러 모델. 기본 `meta-llama/llama-3.3-70b-instruct:free` |
| Mistral (Experiment) | 한도는 콘솔에서 확인, 학습 데이터 사용 동의 필요 | |
| Cerebras 등 | 일 100만 토큰급 보도 | 미확인 |

권장: **개발 중에는 Groq(속도) + Gemini 무료 티어를 폴백**으로. 프로덕션에서는 무료 티어에 의존하지 말고 캐시 + 유료 전환 전제.

### 장소 데이터 (Google Places 대체)
| 소스 | 특징 | 이 저장소 |
|---|---|---|
| **Wikipedia GeoSearch** | 키 불필요·무료. 랜드마크 위주 + **요약문(해설 근거)** 함께 얻음 → 이 앱에 가장 잘 맞음 | `PLACES_PROVIDER=wikipedia` 구현됨 |
| Overpass (OpenStreetMap) | 무료, 건물·가게·유적 태그 풍부. 공용 서버는 한도·불안정 → 운영 시 자체 호스팅 | 미구현(다음 후보) |
| Wikidata SPARQL | 좌표 필터로 유명 개체 조회, 다국어 라벨 | 미구현 |
| Nominatim | 지오코딩, 공용 서버 초당 1회 제한 | 필요 없음 |
| Geoapify / Foursquare / Overture | 무료 티어 있는 상업·오픈 데이터셋 | 미구현 |

추천 조합(전부 무료): **Wikipedia GeoSearch(해설 근거) + Overpass(주변 건물 이름) + Groq/Gemini Flash(생성)**. 부가 이점: OSM/Wikipedia 데이터는 Google처럼 저장 금지 약관이 없어 캐시·오프라인 도시팩을 만들기 쉽다(OSM ODbL, Wikipedia CC BY-SA 표기 필요).

### 음성 (이미 무료)
- 브라우저 Web Speech API (TTS/STT): 무료, 품질은 기기 의존. 유료 TTS 전환은 6단계.

## 3. 키 없이 무료로 돌려보기
```bash
cd backend
export PLACES_PROVIDER=wikipedia           # 키 불필요
export LLM_PROVIDER=groq LLM_API_KEY=...   # Groq 무료 키 (또는 openrouter)
uvicorn app.main:app --host 0.0.0.0
```
키가 전혀 없으면 `/sim.html` 시뮬레이터가 내장 로마 데이터로 동작한다.

## Sources
- [Gemini API Pricing 2026](https://geotoolbox.ai/blog/gemini-api-pricing.md)
- [Gemini API free tier limits](https://yingtu.ai/en/blog/google-gemini-api-free-tier-limits-2026)
- [Free LLM APIs Compared (OpenRouter)](https://openrouter.ai/blog/tutorials/free-llm-apis-compared/)
- [5 Free LLM API Providers (KDnuggets)](https://kdnuggets.com/5-free-llm-api-providers-you-can-use-in-2026)
- [MediaWiki API:Geosearch](https://www.mediawiki.org/wiki/API:Geosearch)
- [Ways to get OpenStreetMap data (Geoapify)](https://geoapify.com/ways-to-get-openstreetmap-data)
