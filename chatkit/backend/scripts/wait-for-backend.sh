#!/usr/bin/env bash

set -euo pipefail

BACKEND_URL="${CHATKIT_BACKEND_URL:-http://127.0.0.1:8000}"
TIMEOUT_SECONDS="${CHATKIT_BACKEND_WAIT_SECONDS:-300}"
START_TIME=$(date +%s)

echo "Waiting for ChatKit backend at ${BACKEND_URL} ..."

while ! curl --silent --fail --max-time 2 "${BACKEND_URL}/docs" >/dev/null; do
  if (( $(date +%s) - START_TIME >= TIMEOUT_SECONDS )); then
    echo "Timed out waiting for ChatKit backend at ${BACKEND_URL}." >&2
    exit 1
  fi
  sleep 1
done

echo "ChatKit backend is ready."