@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
echo.
echo ==========================================
echo   BAECHA - status check
echo ==========================================
echo.

set "TIMES=0910 1110 1310 1500 1530"

echo ===== 1. scheduled tasks =====
echo.
set "FOUND=0"
for %%T in (%TIMES%) do (
  schtasks /Query /TN "baecha %%T" >nul 2>&1
  if errorlevel 1 (
    echo   baecha %%T  --  NOT REGISTERED
  ) else (
    set "FOUND=1"
    echo   baecha %%T
    for /f "tokens=1,* delims=:" %%A in ('schtasks /Query /TN "baecha %%T" /FO LIST /V 2^>nul ^| findstr /i "Next Run Time:Last Run Time:Last Result:Scheduled Task State"') do echo       %%A:%%B
  )
  echo.
)
if "!FOUND!"=="0" (
  echo   Nothing registered.
  echo   Right-click install_schedule.bat - "Run as administrator"
  echo.
)

echo ===== 2. samjung files today =====
echo.
for /f "tokens=2 delims==" %%D in ('wmic os get localdatetime /value ^| find "="') do set "DT=%%D"
set "TODAY=!DT:~0,8!"
set "SJ="
for /f "tokens=2 delims==" %%F in ('findstr /i "^samjung" config.ini') do set "SJ=%%F"
if defined SJ (
  set "SJ=!SJ: =!"
  echo   folder : !SJ!
  dir /b /o-d "!SJ!\*!TODAY!*.xlsx" 2>nul
  if errorlevel 1 echo   -- no file downloaded today --
) else (
  echo   samjung folder not set in config.ini
)
echo.

echo ===== 3. today's log =====
echo.
set "LOG=log\!TODAY!.txt"
if exist "%LOG%" (
  echo   file : %LOG%
  echo   ------------------------------------------
  type "%LOG%"
) else (
  echo   No log today - it never ran today.
)
echo.
pause
