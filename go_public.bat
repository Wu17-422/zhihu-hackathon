@echo off
setlocal
cd /d %~dp0

rem ============================================================
rem  一键把 Demo 挂到公网（后端 + ngrok 固定域名）
rem
rem  为什么要这个脚本：
rem    2026-09-15 提交用的 cloudflared 链接挂了。快速隧道每次启动都换随机
rem    子域名，旧的 solutions-closes-governance-maryland 永远拿不回来。
rem    ngrok 那边域名是「预留」的，重启还是同一个，所以这里改用它。
rem
rem  为什么把 ngrok 放在 %LOCALAPPDATA%：
rem    33MB 的 exe 塞进仓库会被 git 追进去，没必要。
rem ============================================================

rem ---- 预留域名。换域名改这一行，其余不用动 ----
set "PUBLIC_URL=https://exorcism-irritably-stump.ngrok-free.dev"

rem ---- 找 ngrok.exe ----
set "NGROK="
where ngrok >nul 2>nul && set "NGROK=ngrok"
if not defined NGROK if exist "%LOCALAPPDATA%\ngrok\ngrok.exe" set "NGROK=%LOCALAPPDATA%\ngrok\ngrok.exe"
if not defined NGROK (
  echo [X] 找不到 ngrok.exe
  echo     放到 %LOCALAPPDATA%\ngrok\ngrok.exe，或者加进 PATH。
  pause
  exit /b 1
)

rem ---- 找 Python ----
set "PY=py"
py --version >nul 2>nul
if errorlevel 1 (
  set "PY=python"
  python --version >nul 2>nul
  if errorlevel 1 (
    echo [X] 找不到 Python。
    pause
    exit /b 1
  )
)

echo.
echo   后端  : http://localhost:8000/demo
echo   公网  : %PUBLIC_URL%/demo
echo   健康  : %PUBLIC_URL%/api/health
echo.
echo   两个窗口都别关。关了链接就断。
echo.

start "犀利评手 · 后端" cmd /k "%PY% -m uvicorn main:app --host 0.0.0.0 --port 8000"

rem 等后端起来，ngrok 先连上去也没事，只是开头几十秒会 502
timeout /t 4 /nobreak >nul

start "犀利评手 · ngrok" cmd /k "%NGROK% http 8000 --url %PUBLIC_URL%"

timeout /t 6 /nobreak >nul
start "" "%PUBLIC_URL%/demo"

echo   浏览器已经打开。链接断了自己重新双击这个脚本就行。
exit /b 0
