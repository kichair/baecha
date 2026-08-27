@echo off
setlocal enabledelayedexpansion
echo.
echo ==========================================
echo   BAECHA - schedule installer  (v2)
echo ==========================================
echo.
echo Folder : %~dp0
echo.

net session >nul 2>&1
if errorlevel 1 (
  echo [X] NOT running as administrator.
  echo     Right-click this file - "Run as administrator"
  echo.
  pause
  exit /b 1
)
echo [OK] administrator

if not exist "%~dp0run.bat" (
  echo [X] run.bat NOT found in this folder.
  echo.
  pause
  exit /b 1
)
echo [OK] run.bat found
echo.

set "BAT=%~dp0run.bat"

rem ==========================================
rem   TIMES - edit this line only  (HHMM)
rem ==========================================
set "TIMES=0910 1110 1310 1500 1530"

echo --- removing old entries ---
for %%T in (0900 0910 1100 1110 1300 1310 1400 1500 1510 1530 1600 1630 1700 1710) do schtasks /Delete /TN "baecha %%T" /F >nul 2>&1
echo done.
echo.

for %%T in (%TIMES%) do (
  set "T=%%T"
  set "HH=!T:~0,2!"
  set "MM=!T:~2,2!"
  echo --- creating !HH!:!MM! ---
  schtasks /Create /TN "baecha %%T" /TR "cmd /c \"%BAT%\"" /SC WEEKLY /D MON,TUE,WED,THU,FRI /ST !HH!:!MM! /RL HIGHEST /F
)
echo.

rem ==========================================
rem   catch up missed runs, ignore battery,
rem   wake the PC, 30 min limit
rem ==========================================
echo --- applying catch-up settings ---
for %%T in (%TIMES%) do (
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$s = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -WakeToRun -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -MultipleInstances IgnoreNew; Set-ScheduledTask -TaskName 'baecha %%T' -Settings $s | Out-Null; Write-Host '  [OK] baecha %%T'" 2>nul
  if errorlevel 1 echo   [!] baecha %%T - could not apply settings
)
echo.

echo ==========================================
echo   registered list
echo ==========================================
for %%T in (%TIMES%) do (
  for /f "tokens=1,* delims=:" %%A in ('schtasks /Query /TN "baecha %%T" /FO LIST 2^>nul ^| findstr /i "TaskName Next Last Status"') do echo   %%A:%%B
  echo   ---
)
echo.
echo   Run one right now:
echo       schtasks /Run /TN "baecha 1530"
echo.
echo   Check status later:  check.bat
echo.
pause
