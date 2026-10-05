@echo off
chcp 65001 >nul
title DeckCraft 快速启动
cd /d "%~dp0"

echo ============================================
echo   DeckCraft . 演示设计工作流   快速启动
echo ============================================
echo.

where python >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 Python，请先安装 Python 3.10+ 并加入 PATH。
  pause
  exit /b 1
)

if not exist ".env" (
  echo [提示] 未找到 .env，正在从 .env.example 复制...
  if exist ".env.example" copy /y ".env.example" ".env" >nul
  echo        请打开 .env 填入 DEEPSEEK_API_KEY，然后重新运行本脚本。
  pause
  exit /b 1
)

echo [1/2] 检查依赖...
python -c "import flask, requests, dotenv, numpy, cv2, pptx" >nul 2>nul
if errorlevel 1 (
  echo        缺少依赖，正在安装 requirements.txt ...
  python -m pip install -r requirements.txt
  if errorlevel 1 (
    echo [错误] 依赖安装失败，请检查网络或手动运行: python -m pip install -r requirements.txt
    pause
    exit /b 1
  )
)

echo [2/3] 检查前端构建产物...
if not exist "frontend\dist\index.html" (
  where npm >nul 2>nul
  if errorlevel 1 (
    echo        未检测到 npm，跳过前端构建（将使用旧版模板页面）。
  ) else (
    echo        未找到 frontend\dist，正在构建前端（首次较慢）...
    pushd frontend
    call npm install
    call npm run build
    popd
  )
)

echo [3/3] 启动服务 http://127.0.0.1:5000 ...
start "" http://127.0.0.1:5000
python app.py

pause
