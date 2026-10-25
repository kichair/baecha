@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ===== Delivery documents maker =====
echo Folder: %CD%

set PY=
py -3 --version >nul 2>nul && set PY=py -3
if "%PY%"=="" python --version >nul 2>nul && set PY=python
if "%PY%"=="" goto nopython

if not exist "%~dp0납품서류_만들기.py" goto nofile

%PY% -c "import hwpx, PIL" >nul 2>nul
if errorlevel 1 (
  echo Installing required packages - first run only, please wait...
  %PY% -m pip install python-hwpx pillow pywin32
)

echo Starting... this black window will close by itself.
if "%PY%"=="py -3" (
  start "" pyw -3 "%~dp0납품서류_만들기.py"
) else (
  start "" pythonw "%~dp0납품서류_만들기.py"
)
exit /b 0

:nopython
echo.
echo [!] Python was not found on this PC.
echo     1. Go to https://www.python.org/downloads/ and install Python.
echo     2. In the installer, CHECK "Add python.exe to PATH".
echo     3. Run this file again.
goto end

:nofile
echo.
echo [!] 납품서류_만들기.py not found next to this file.
echo     Unzip the zip file first, then run this file from the unzipped folder.
goto end

:failed
echo.
echo [!] The program stopped with an error. Please send a photo of this window.

:end
echo.
pause
