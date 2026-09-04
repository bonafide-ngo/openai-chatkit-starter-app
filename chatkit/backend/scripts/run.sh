#!/usr/bin/env bash

# Simple helper to start the ChatKit backend (similar to cat-lounge UX).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

if [ ! -x ".venv/bin/python" ] || ! ".venv/bin/python" -c "import sys" >/dev/null 2>&1; then
  if [ -d ".venv" ]; then
    echo "Recreating unusable virtual env in $PROJECT_ROOT/.venv ..."
    rm -rf .venv
  else
    echo "Creating virtual env in $PROJECT_ROOT/.venv ..."
  fi
  python3 -m venv .venv
fi

source .venv/bin/activate

echo "Installing backend deps (editable) ..."
python -m pip install -e . --only-binary=:all: --disable-pip-version-check >/dev/null

# Load app vars from .env.local and auth vars from .env.auth.local.
ENV_FILE="$PROJECT_ROOT/../.env.local"
if [ -f "$ENV_FILE" ]; then
  echo "Sourcing backend configuration from $ENV_FILE"
  # shellcheck disable=SC1090
  set -a
  . "$ENV_FILE"
  set +a
fi

AUTH_ENV_FILE="$PROJECT_ROOT/../.env.auth.local"
if [ -f "$AUTH_ENV_FILE" ]; then
  echo "Sourcing authentication configuration from $AUTH_ENV_FILE"
  set -a
  . "$AUTH_ENV_FILE"
  set +a
fi

if [ -z "${OPENAI_API_KEY:-}" ]; then
  echo "Set OPENAI_API_KEY in your environment or in .env.local before running this script."
  exit 1
fi

if [ -z "${CHATKIT_PUBLIC_BASE_URL:-}" ]; then
  echo "Warning: CHATKIT_PUBLIC_BASE_URL is not set; image previews require an HTTPS tunnel or deployed backend URL."
fi

echo "Starting ChatKit backend on http://127.0.0.1:8000 ..."
exec python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

