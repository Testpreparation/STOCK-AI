@echo off
chcp 65001 > nul
cd /d "%~dp0backend"
if not exist ".venv\Scripts\python.exe" (
  py -m venv .venv
)
call .venv\Scripts\activate.bat
py -m pip install -r requirements.txt
if not exist .env copy .env.example .env
echo.
echo 初回は backend\.env を開いてAPIキーを設定してください。
echo 設定済みならサーバーを起動します。
pause
py app.py
pause
