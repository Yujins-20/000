# app/ — Capacitor 네이티브 앱

전체 절차와 체크리스트는 [../docs/APP_RELEASE.md](../docs/APP_RELEASE.md).

```bash
npm ci
npm test                                   # 빌드 게이트·패치 스크립트·네이티브 로직 테스트
WALKGUIDE_API_BASE=https://api.example.com npm run sync:android    # 웹 빌드 + cap sync + 스토어 설정 패치
npm run sync:ios                            # (macOS)
npm run assets                              # resources/ → 아이콘·스플래시 (원본은 python3 scripts/make-icons.py)
```
릴리스 빌드(`RELEASE=1`)는 `WALKGUIDE_API_BASE`(https 고정 도메인), `OPERATOR_NAME`, `CONTACT_EMAIL`, `CONFIRM_APP_ID` 가 없으면 실패한다.
