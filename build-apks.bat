@echo off
rem Builds the release APKs of all three Android apps and copies them into apks\
rem   build-apks.bat                 -> customer + warehouse + rider + provider
rem   build-apks.bat rider           -> only the rider app (also: customer, warehouse)
rem   build-apks.bat nopull          -> skip "git pull" (can be combined: nopull rider)
rem Needs: Node, JDK 17, Android SDK (ANDROID_HOME). See docs\BUILD-APKS.md.
setlocal EnableDelayedExpansion
cd /d "%~dp0"
set "ROOT=%CD%"
set "OUT=%ROOT%\apks"
set "PULL=1"
set "ONLY="
for %%A in (%*) do (
  if /i "%%A"=="nopull" (set "PULL=0") else (set "ONLY=!ONLY! %%A")
)
if "%ONLY%"=="" set "ONLY= customer warehouse rider provider"

if "%PULL%"=="1" (
  echo === Getting the latest code from GitHub ^(main^)
  git pull origin main || echo [warning] git pull failed, building the code that is already here
)

if not exist "%OUT%" mkdir "%OUT%"
set "FAILED="
set "MISSING_FIREBASE="

for %%A in (%ONLY%) do (
  set "DIR="
  if /i "%%A"=="customer"  set "DIR=blinkit-app-"
  if /i "%%A"=="warehouse" set "DIR=autozo-warehouse"
  if /i "%%A"=="rider"     set "DIR=autozo-backend\autozo-mobile"
  if /i "%%A"=="provider"  set "DIR=autozo-provider"
  if "!DIR!"=="" (
    echo [error] unknown app "%%A" ^(use customer, warehouse or rider^)
    set "FAILED=!FAILED! %%A"
  ) else (
    call :build %%A "!DIR!"
  )
)

echo.
echo ================================================================
if defined MISSING_FIREBASE echo [warning] no google-services.json for:%MISSING_FIREBASE% - OTP login and push will not work in these APKs
if defined FAILED (
  echo FAILED:%FAILED%   ^(scroll up for the first red error^)
  echo APKs that did build are in %OUT%
  exit /b 1
)
echo DONE. APKs are in %OUT%
dir /b "%OUT%\*.apk"
exit /b 0

:build
set "APP=%~1"
set "APPDIR=%ROOT%\%~2"
echo.
echo ================================================================
echo === %APP%  ^(%~2^)
echo ================================================================
if not exist "%APPDIR%\android\app\google-services.json" set "MISSING_FIREBASE=%MISSING_FIREBASE% %APP%"
pushd "%APPDIR%"
echo --- npm install
call npm install --no-audit --no-fund
if errorlevel 1 goto :buildfail
pushd android
echo --- gradlew assembleRelease
call gradlew.bat assembleRelease
if errorlevel 1 (popd & goto :buildfail)
popd
set "APK=%APPDIR%\android\app\build\outputs\apk\release\app-release.apk"
if not exist "%APK%" goto :buildfail
copy /y "%APK%" "%OUT%\autozo-%APP%.apk" >nul
echo --- OK: apks\autozo-%APP%.apk
popd
exit /b 0

:buildfail
popd
echo [error] %APP% build failed
set "FAILED=%FAILED% %APP%"
exit /b 0
