#!/usr/bin/env bash
# Runs inside the emulator step: install the app, start it, play the flow, keep the logs.
PKG="$1"
FLOW="$2"
OUT=e2e-out
mkdir -p "$OUT"
adb install -r -g app.apk
adb logcat -c
adb logcat -v time > "$OUT/logcat.txt" 2>&1 &
LOGCAT=$!
adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 > /dev/null
sed "s/__OTP__/${OTP:-0000}/" "$FLOW" > /tmp/flow.txt
python3 e2e/ui.py "$PKG" /tmp/flow.txt "$OUT"
RC=$?
sleep 3
kill "$LOGCAT" 2>/dev/null
grep -E "FATAL EXCEPTION|AndroidRuntime|ReactNativeJS|E/ReactNative|Unhandled|TypeError|ReferenceError" "$OUT/logcat.txt" | head -300 > "$OUT/errors.txt"
echo "----- app errors from logcat -----"
cat "$OUT/errors.txt"
exit $RC
