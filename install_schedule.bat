@echo off
setlocal enabledelayedexpansion
echo.
echo ==========================================
echo   BAECHA - schedule installer
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
echo.

if not exist "%~dp0run.bat" (
  echo [X] run.bat NOT found in this folder.
  echo     Put install_schedule.bat in the same folder as run.bat
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
  echo.
)

echo ==========================================
echo   registered list
echo ==========================================
for %%T in (%TIMES%) do schtasks /Query /TN "baecha %%T"
echo.
echo   To run it right now, type:
echo       schtasks /Run /TN "baecha 1530"
echo.
pause
