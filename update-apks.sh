#!/usr/bin/env bash
# Copies the newest customer, warehouse and rider APKs (built by GitHub Actions and pushed to the
# apk-builds branch) to autozo-backend/downloads/, served at https://app-api.autozo.org/downloads/.
# deploy.sh runs this; it can also be run on its own any time (no restart needed):
#   bash ~/bingoor-project/update-apks.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
OUT="$ROOT/autozo-backend/downloads"
cd "$ROOT"
git fetch -q origin +refs/heads/apk-builds:refs/remotes/origin/apk-builds
mkdir -p "$OUT"
for app in customer warehouse rider; do
  f="autozo-$app.apk"
  git show "origin/apk-builds:$f" > "$OUT/$f.tmp"
  mv -f "$OUT/$f.tmp" "$OUT/$f"
done
echo "   APKs updated to build $(git log -1 --format='%h %cd' --date=short origin/apk-builds)"
