@echo off
chcp 65001 >nul
cd /d "%~dp0"
python -c "import hwpx, PIL, win32com" 2>nul
if errorlevel 1 (
  echo First run: installing required packages...
  python -m pip install python-hwpx pillow pywin32
)
python "%~dp0납품서류_만들기.py"
if errorlevel 1 pause
