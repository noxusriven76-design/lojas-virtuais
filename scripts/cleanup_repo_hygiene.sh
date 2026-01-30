#!/usr/bin/env bash
set -euo pipefail

# Repo hygiene cleanup:
# - remove local artifacts (Python caches, Flutter build/IDE files)
# - untrack accidentally versioned cache files
# - ensure .env files remain local only

cd "$(git rev-parse --show-toplevel)"

echo "[1/4] Removing tracked Python cache artifacts (__pycache__/, *.pyc) from git index..."
tracked_cache_files=$(git ls-files | grep -E '(__pycache__/|\.pyc$)' || true)
if [[ -n "${tracked_cache_files}" ]]; then
  printf '%s\n' "${tracked_cache_files}" | xargs -d '\n' git rm -f --cached
else
  echo "- none found"
fi

echo "[2/4] Removing Python cache artifacts from working tree..."
find backend -type d -name '__pycache__' -prune -exec rm -rf {} + 2>/dev/null || true
find backend -type f -name '*.pyc' -delete 2>/dev/null || true

echo "[3/4] Removing Flutter/Android Studio local artifacts (.dart_tool/, build/, .idea/, *.iml, android/local.properties)..."
find mobile_app -type d -name '.dart_tool' -prune -exec rm -rf {} + 2>/dev/null || true
find mobile_app -type d -name 'build' -prune -exec rm -rf {} + 2>/dev/null || true
find mobile_app -type d -name '.idea' -prune -exec rm -rf {} + 2>/dev/null || true
find mobile_app -type f -name '*.iml' -delete 2>/dev/null || true
find mobile_app -type f -path '*/android/local.properties' -delete 2>/dev/null || true

echo "[4/4] Removing local .env files (keeps only *.env.example)..."
rm -f .env backend/.env 2>/dev/null || true

echo "Done. Next steps:"
echo "- Review: git status"
echo "- Commit .gitignore + README changes and the removals above."
