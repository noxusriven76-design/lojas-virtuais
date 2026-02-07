#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

echo "[hygiene] checking tracked local/env/cache artifacts..."
if git ls-files | grep -E '(^backend/\.env$|__pycache__/|\.pyc$|\.dart_tool|android\.gradle-nb-cache|flutter_application_1_loja_virtual\.dart_tool-)'; then
  echo "[hygiene] FAIL: tracked generated/local artifacts detected."
  exit 1
fi

echo "[hygiene] checking submodule metadata..."
if git ls-files -s mobile_app/flutter_application_1_loja_virtual | grep -q '^160000'; then
  if [[ ! -f .gitmodules ]]; then
    echo "[hygiene] FAIL: mobile gitlink exists but .gitmodules is missing."
    exit 1
  fi
  git submodule status >/dev/null
fi

echo "[hygiene] OK"
