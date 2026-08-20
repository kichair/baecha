@echo off
cd /d "%~dp0"

if not exist "log" mkdir "log"
set "LOG=log\%date:~0,4%%date:~5,2%%date:~8,2%.txt"

echo. >> "%LOG%"
echo ===== %date% %time% ===== >> "%LOG%"

rem ---- find python ----
set "PY="
where py >nul 2>&1 && set "PY=py -3"
if not defined PY (
  where python >nul 2>&1 && set "PY=python"
)
if not defined PY (
  for /f "delims=" %%P in ('dir /b /s "%LOCALAPPDATA%\Programs\Python\python.exe" 2^>nul') do set "PY=%%P"
)
if not defined PY (
  for /f "delims=" %%P in ('dir /b /s "C:\Python3*\python.exe" 2^>nul') do set "PY=%%P"
)

if not defined PY (
  echo [X] python NOT found
  echo [X] python NOT found >> "%LOG%"
  goto :end
)

echo python = %PY%
echo python = %PY% >> "%LOG%"
echo.

echo [1/2] ecount - download samjung sales list
echo [1/2] fetch_samjung >> "%LOG%"
%PY% fetch_samjung.py >> "%LOG%" 2>&1
echo     exit code = %errorlevel%
echo     exit code = %errorlevel% >> "%LOG%"
echo.

echo [2/2] push kwangil + samjung to baecha server
echo [2/2] push_baecha >> "%LOG%"
%PY% push_baecha.py >> "%LOG%" 2>&1
echo     exit code = %errorlevel%
echo     exit code = %errorlevel% >> "%LOG%"
echo.

:end
echo done. log file : %LOG%
