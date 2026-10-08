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

## 테스트
`cd backend && python -m pytest`
