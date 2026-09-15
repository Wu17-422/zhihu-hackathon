@echo off
setlocal
cd /d %~dp0

set "PY=py"
py --version >nul 2>nul
if errorlevel 1 (
  set "PY=python"
  python --version >nul 2>nul
  if errorlevel 1 (
    echo [X] Python not found. Install Python and check "Add Python to PATH".
    pause
    exit /b 1
  )
)

rem secret.txt wins: pasting a 40-char token into this console is too easy to get wrong
rem (2026-09-14 someone pasted 118 chars because the copy grabbed the docs text too -> 401).
if exist "secret.txt" goto have_secret

if "%ZHIHU_ACCESS_SECRET%"=="" (
  echo ZHIHU_ACCESS_SECRET not set.
  echo   Tip: put the 40-char secret in backend\secret.txt and just press Enter here.
  set /p "ZHIHU_ACCESS_SECRET=Paste your Access Secret and press Enter (or just Enter for mock-only): "
  echo.
)

rem A real Access Secret is exactly 40 chars. Longer means the paste grabbed extra text.
if not "%ZHIHU_ACCESS_SECRET%"=="" if not "%ZHIHU_ACCESS_SECRET:~40%"=="" echo [!] Secret is longer than 40 chars. Restart and paste ONLY the 40-char secret.
if not "%ZHIHU_ACCESS_SECRET%"=="" if "%ZHIHU_ACCESS_SECRET:~39,1%"=="" echo [!] Secret is shorter than 40 chars. It is 40 hex characters exactly.
goto after_secret

:have_secret
echo Using backend\secret.txt (skipping the prompt).

:after_secret

echo Starting backend...
echo   Demo page : http://localhost:8000/demo
echo   API docs  : http://localhost:8000/docs
echo   Close this window to stop the server.
echo.

%PY% -m uvicorn main:app --host 0.0.0.0 --port 8000

echo.
echo Server stopped.
pause
