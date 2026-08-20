@echo off
cd /d "%~dp0"
echo ==========================================
echo   BAECHA - manual test run
echo ==========================================
echo.
echo Folder : %~dp0
echo.

if not exist "%~dp0run.bat" (
  echo [X] run.bat NOT found in this folder.
  echo.
  pause
  exit /b 1
)

call "%~dp0run.bat"

echo.
echo ==========================================
echo   log
echo ==========================================
set "LOG=log\%date:~0,4%%date:~5,2%%date:~8,2%.txt"
if exist "%LOG%" (type "%LOG%") else (echo no log file)
echo.
echo ==========================================
pause
