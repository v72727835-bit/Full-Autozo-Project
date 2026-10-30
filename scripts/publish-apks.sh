#!/usr/bin/env bash
# Runs ON the VPS: the APK workflows pipe it over SSH (`ssh ... 'bash -s -- /tmp/autozo-apks' < this`).
# Puts every autozo-*.apk from the given folder into the folders the site serves /downloads from.
# It picks up every app (customer, rider, warehouse, provider and any added later), so there is
# no per-app list on the server to keep in sync, and nothing to copy by hand after a build.
set -euo pipefail
SRC="${1:-/tmp/autozo-apks}"
shopt -s nullglob
apks=("$SRC"/autozo-*.apk)
if [ ${#apks[@]} -eq 0 ]; then echo "No APKs in $SRC"; exit 0; fi

# `shared/downloads` survives redeploys; `current/.../downloads` is what the running backend serves.
# More folders can be added with APK_EXTRA_DIRS="/path/one /path/two".
dirs=(/opt/autozo/shared/downloads /opt/autozo/current/autozo-backend/downloads ${APK_EXTRA_DIRS:-})
published=0
for d in "${dirs[@]}"; do
  [ -d "$d" ] || continue
  copied=0
  for f in "${apks[@]}"; do
    name="$(basename "$f")"
    # A broken or half-uploaded file must never replace a working APK.
    if [ "$(stat -c %s "$f")" -lt 1000000 ]; then echo "   skipped $name (too small to be an APK)"; continue; fi
    cp -f "$f" "$d/.$name.tmp"
    mv -f "$d/.$name.tmp" "$d/$name"
    copied=$((copied + 1))
  done
  echo "   published $copied APK(s) to $d"
  published=1
done
[ "$published" = 1 ] || { echo "No download folder found on this server"; exit 1; }
