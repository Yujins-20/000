#!/usr/bin/env bash
# 환경파일을 앱 import 전에 주입하고 127.0.0.1:8082 에서 실행한다 (터널로만 공개).
#   bash scripts/run_server.sh        (ENV_FILE, PORT, PYTHON 으로 변경 가능)
set -euo pipefail
cd "$(dirname "$0")/.."
set -a
# shellcheck disable=SC1090
source "${ENV_FILE:-.env.server}"
set +a
exec "${PYTHON:-.venv/bin/python}" -m uvicorn app.main:app --host 127.0.0.1 --port "${PORT:-8082}"
