﻿﻿#requires -Version 5.1
<#
    知乎评论区观点分析 - 后端一键启动器 (PowerShell 版)
    零基础用户开箱即用，无需手动安装任何东西。

    用法：
        右键 -> "使用 PowerShell 运行"
        或 在 PowerShell 里： .\start.ps1
#>

$ROOT = Split-Path -Parent $PSCommandPath
Set-Location $ROOT

Clear-Host
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "   知乎评论区观点分析 - 后端一键启动" -ForegroundColor White
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# 1. 检测 Python（优先 py 启动器，兼容 3.x）
$PYTHON = ""

try {
    $ver = (& py --version 2>&1).ToString()
    if ($ver -match "3\.\d+") { $PYTHON = "py" }
} catch {}

if (-not $PYTHON) {
    try {
        $p = (Get-Command python -ErrorAction Stop).Source
        $ver = (& $p --version 2>&1).ToString()
        if ($ver -match "3\.\d+") { $PYTHON = $p }
    } catch {}
}

if (-not $PYTHON) {
    Write-Host ""
    Write-Host "[!] 没找到 Python 3！" -ForegroundColor Red
    Write-Host "    请安装 Python 3.x（安装时勾选 Add Python to PATH）。"
    Write-Host "    下载地址：https://www.python.org/downloads/"
    Write-Host ""
    Write-Host "按任意键退出..."
    $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
    exit 1
}

$ver = (& $PYTHON --version 2>&1).ToString()
Write-Host "[OK] 使用 Python：$PYTHON （$ver）" -ForegroundColor Green

# 2. 检查/安装依赖
Write-Host ""
Write-Host "[..] 检查依赖包..." -NoNewline -ForegroundColor Yellow
$needInstall = $false
try {
    $deps = Get-Content "$ROOT\requirements.txt"
    foreach ($pkg in $deps) {
        $pkg = $pkg.Trim()
        if ($pkg -eq "" -or $pkg.StartsWith("#")) { continue }
        $name = $pkg.Split(@('>', '=', '<', '~', '!', '@'))[0].Trim()
        if ($name -ne "") {
            $installed = (& $PYTHON -m pip show $name 2>&1) | Out-String
            if ($installed -notmatch "Name: $name") {
                $needInstall = $true
                break
            }
        }
    }
} catch {
    $needInstall = $true
}

if ($needInstall) {
    Write-Host ""
    Write-Host "[..] 正在安装依赖包（首次运行需要一点时间）..." -ForegroundColor Yellow
    & $PYTHON -m pip install -r "$ROOT\requirements.txt"
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "[!] 依赖安装失败，请检查网络连接后重试。" -ForegroundColor Red
        $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
        exit 1
    }
    Write-Host "[OK] 依赖安装完成" -ForegroundColor Green
} else {
    Write-Host "[OK] 依赖已就绪" -ForegroundColor Green
}

# 3. 配置 Access Secret
Write-Host ""
$SECRET = [System.Environment]::GetEnvironmentVariable("ZHIHU_ACCESS_SECRET", "Process")
if ([string]::IsNullOrEmpty($SECRET)) {
    Write-Host "---------------------------------------------" -ForegroundColor DarkGray
    Write-Host " Access Secret 配置" -ForegroundColor DarkGray
    Write-Host " 留空 = 使用 Mock 模式（不消耗额度）" -ForegroundColor DarkGray
    Write-Host " 填入 = 调用真实 AI 接口（消耗额度）" -ForegroundColor DarkGray
    Write-Host "---------------------------------------------" -ForegroundColor DarkGray
    Write-Host ""
    $input = Read-Host "请输入 Access Secret（直接回车跳过）"
    if ([string]::IsNullOrEmpty($input)) {
        Write-Host "[i] 已跳过，将使用 Mock 假数据模式。" -ForegroundColor Yellow
    } else {
        $env:ZHIHU_ACCESS_SECRET = $input
        Write-Host "[OK] Secret 已设置，将调用真实 AI 接口。" -ForegroundColor Green
    }
} else {
    Write-Host "[OK] 已读取到环境变量中的 Access Secret" -ForegroundColor Green
}

# 4. 启动服务
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " 正在启动后端服务..." -ForegroundColor White
Write-Host ""
Write-Host " 演示页面：  http://localhost:8000/demo" -ForegroundColor White
Write-Host " API 文档：  http://localhost:8000/docs" -ForegroundColor White
Write-Host " 接口总览：  http://localhost:8000/" -ForegroundColor White
Write-Host ""
Write-Host " 按 Ctrl+C 或关闭窗口 = 停止服务" -ForegroundColor Yellow
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# 延迟 2 秒后自动打开浏览器
Start-Sleep 2
Start-Process "http://localhost:8000/demo"

# 启动 uvicorn
& $PYTHON -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload

Write-Host ""
Write-Host "[i] 服务已停止。" -ForegroundColor Yellow
Write-Host ""
Write-Host "按任意键退出..."
$null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')