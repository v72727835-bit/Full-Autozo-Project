#!/usr/bin/env bash
# Copies the newest customer, warehouse and rider APKs (built by GitHub Actions and pushed to the
# apk-builds branch) to autozo-backend/downloads/, served at https://app-api.autozo.org/downloads/,
# and to the main domain's folder ~/public_html/downloads/ (https://autozo.org/downloads/).
# Other folders: APK_PUBLIC_DIRS="/path/one /path/two" bash update-apks.sh
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

for dir in ${APK_PUBLIC_DIRS:-$HOME/public_html/downloads}; do
  [ -d "$(dirname "$dir")" ] || { echo "   skipped $dir (folder above it does not exist)"; continue; }
  mkdir -p "$dir"
  # Apache: serve .apk as an Android download, not as a zip or text.
  [ -f "$dir/.htaccess" ] || printf '%s\n' \
    'AddType application/vnd.android.package-archive .apk' \
    '<IfModule mod_headers.c>' '<FilesMatch "\.apk$">' '  Header set Content-Disposition attachment' '</FilesMatch>' '</IfModule>' > "$dir/.htaccess"
  for app in customer warehouse rider; do
    cp -f "$OUT/autozo-$app.apk" "$dir/autozo-$app.apk.tmp"
    mv -f "$dir/autozo-$app.apk.tmp" "$dir/autozo-$app.apk"
  done
  echo "   copied to $dir"
done
echo "   APKs updated to build $(git log -1 --format='%h %cd' --date=short origin/apk-builds)"
