#!/usr/bin/env bash
# GPU 서버용 .env.server 생성. 기존 GPU API 키 파일에서 읽어 오며, 키 값을 화면에 출력하지 않는다.
#   GPU_ENV=/home1/irteam/vlm-api/.env bash scripts/make_env_server.sh
set -euo pipefail
cd "$(dirname "$0")/.."
GPU_ENV="${GPU_ENV:-/home1/irteam/vlm-api/.env}"
OUT="${OUT:-.env.server}"
[ -f "$OUT" ] && { echo "$OUT 이(가) 이미 있어 덮어쓰지 않습니다. 지우고 다시 실행하세요." >&2; exit 1; }
KEY="$(sed -n 's/^VLM_API_KEY=//p' "$GPU_ENV" | head -n1)"
[ -n "$KEY" ] || { echo "VLM_API_KEY 를 찾을 수 없습니다: $GPU_ENV" >&2; exit 1; }
umask 077
# 값에 공백/특수문자가 있어도 `source` 로 안전하게 읽히도록 큰따옴표로 감싼다
q() { printf '"%s"' "$(printf '%s' "$1" | sed 's/[\\"$`]/\\&/g')"; }
{
  echo "LLM_PROVIDER=vlm"
  echo "VLM_BASE_URL=${VLM_BASE_URL:-http://127.0.0.1:8000/v1}"
  echo "VLM_API_KEY=$KEY"
  echo "VLM_MODEL=${VLM_MODEL:-qwen3.8-vl}"
  echo "VLM_REASONING_EFFORT=low"
  echo "TTS_BASE_URL=${TTS_BASE_URL:-http://127.0.0.1:8091/v1}"
  echo "TTS_API_KEY=$KEY"
  echo "TTS_MODEL=${TTS_MODEL:-Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice}"
  echo "TTS_VOICE=${TTS_VOICE:-sohee}"
  echo "TTS_FORMAT=mp3"
  echo "TTS_CACHE_DIR=.tts_cache"
  echo "MAX_TTS_CHARS=600"
  echo "PLACES_PROVIDER=${PLACES_PROVIDER:-wikipedia}"
  echo "WIKI_LANG=${WIKI_LANG:-ko}"
  # 네이티브 앱(Capacitor)의 웹뷰 출처: iOS capacitor://localhost, Android https://localhost. 웹 프런트를 따로 두면 그 주소를 추가.
  echo "ALLOWED_ORIGINS=$(q "${ALLOWED_ORIGINS:-capacitor://localhost,https://localhost}")"
  echo "OPERATOR_NAME=$(q "${OPERATOR_NAME:-}")"
  echo "CONTACT_EMAIL=$(q "${CONTACT_EMAIL:-}")"
  echo "MIN_APP_VERSION=${MIN_APP_VERSION:-}"
  echo "FEEDBACK_PATH=${FEEDBACK_PATH:-feedback.jsonl}"
  echo "RATE_LIMIT_ASK_PER_MIN=${RATE_LIMIT_ASK_PER_MIN:-20}"
  echo "RATE_LIMIT_TTS_PER_MIN=${RATE_LIMIT_TTS_PER_MIN:-150}"
} > "$OUT"
chmod 600 "$OUT"
echo "생성됨: $OUT (권한 600, 키는 출력하지 않았습니다)"
