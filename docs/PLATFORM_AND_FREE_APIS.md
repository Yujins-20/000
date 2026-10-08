# 웹 vs 앱, 그리고 무료 API 조사

## 1. 웹(PWA)으로 시작할까, 앱으로 시작할까

**결론: 웹(PWA)으로 시작 → 검증되면 Capacitor로 감싸 네이티브 앱화.** 처음부터 네이티브 앱으로 짜지 않는다.

| 기준 | 웹(PWA) | 네이티브 앱 |
|---|---|---|
| 개발 속도·비용 | 빠름, 단일 코드, 배포=URL | 느림, 스토어 심사, iOS/Android 이중 |
| 테스트 배포 | 링크 하나로 지인 베타 | TestFlight/내부 테스트 설정 필요 |
| GPS·나침반·마이크·TTS | 가능 (HTTPS 필요, iOS는 나침반 권한 팝업) | 가능, 더 안정적 |
| **화면 꺼진 상태/주머니 속 사용** | **약함** — 백그라운드 위치·오디오가 브라우저에서 불안정 | **강함** — 백그라운드 위치, 잠금화면 오디오 |
| 오프라인 도시팩 | Service Worker로 가능하나 용량·삭제 위험 | 안정적 |
| 결제 | Stripe 등 자유(수수료 낮음) | 스토어 인앱결제 15~30% |
| 발견성 | 검색·링크 공유 | 스토어 노출 |

**핵심 트레이드오프**: 이 서비스의 이상적 사용은 "주머니에 폰, 귀에 이어폰, 걸으면서 대화"라서 최종적으로는 백그라운드 위치/오디오가 필요 = 네이티브가 필요하다. 하지만 지금 증명할 가설은 *"해설이 가이드만큼 재밌고 방향 인식이 맞는가"*이지 백그라운드 안정성이 아니다. 화면을 켠 채 걷는 PWA로 그 가설은 충분히 검증된다.

**전환 경로**: 
1. PWA(현재) → 지인 베타로 해설 품질·방향 정확도 검증 
2. 사용자들이 "화면 꺼지면 멈춘다"를 불평하기 시작하면 → **Capacitor**(웹 코드 재사용) + 백그라운드 위치 플러그인으로 앱 래핑 
3. 이후 필요 시 네이티브 전환. 백엔드(FastAPI)는 그대로 재사용.

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
