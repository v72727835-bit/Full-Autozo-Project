#!/usr/bin/env bash
# Builds the release APKs of all three Android apps and copies them into apks/
#   bash build-apks.sh                -> customer + warehouse + rider
#   bash build-apks.sh rider          -> only the rider app (also: customer, warehouse)
#   bash build-apks.sh nopull         -> skip "git pull" (can be combined: nopull rider)
# Needs: Node, JDK 17, Android SDK (ANDROID_HOME). See docs/BUILD-APKS.md.
set -u
ROOT="$(cd "$(dirname "$0")" && pwd)"
OUT="$ROOT/apks"
PULL=1
APPS=()
for a in "$@"; do
  if [ "$a" = nopull ]; then PULL=0; else APPS+=("$a"); fi
done
[ ${#APPS[@]} -eq 0 ] && APPS=(customer warehouse rider)

cd "$ROOT"
if [ "$PULL" = 1 ]; then
  echo "=== Getting the latest code from GitHub (main)"
  git pull origin main || echo "[warning] git pull failed, building the code that is already here"
fi

mkdir -p "$OUT"
FAILED=""
MISSING_FIREBASE=""

for app in "${APPS[@]}"; do
  case "$app" in
    customer)  dir="blinkit-app-" ;;
    warehouse) dir="autozo-warehouse" ;;
    rider)     dir="autozo-backend/autozo-mobile" ;;
    *) echo "[error] unknown app \"$app\" (use customer, warehouse or rider)"; FAILED="$FAILED $app"; continue ;;
  esac
  echo
  echo "================================================================"
  echo "=== $app  ($dir)"
  echo "================================================================"
  [ -f "$ROOT/$dir/android/app/google-services.json" ] || MISSING_FIREBASE="$MISSING_FIREBASE $app"
  apk="$ROOT/$dir/android/app/build/outputs/apk/release/app-release.apk"
  if (cd "$ROOT/$dir" && npm install --no-audit --no-fund && cd android && chmod +x gradlew && ./gradlew assembleRelease) && [ -f "$apk" ]; then
    cp "$apk" "$OUT/autozo-$app.apk"
    echo "--- OK: apks/autozo-$app.apk"
  else
    echo "[error] $app build failed"
    FAILED="$FAILED $app"
  fi
done

echo
echo "================================================================"
[ -n "$MISSING_FIREBASE" ] && echo "[warning] no google-services.json for:$MISSING_FIREBASE - OTP login and push will not work in these APKs"
if [ -n "$FAILED" ]; then
  echo "FAILED:$FAILED   (scroll up for the first error)"
  echo "APKs that did build are in $OUT"
  exit 1
fi
echo "DONE. APKs are in $OUT"
ls -1 "$OUT"/*.apk
