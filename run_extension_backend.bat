@echo off
setlocal
cd /d "%~dp0"

if "%HTTP_PROXY%"=="http://127.0.0.1:9" set HTTP_PROXY=
if "%HTTPS_PROXY%"=="http://127.0.0.1:9" set HTTPS_PROXY=
if "%ALL_PROXY%"=="http://127.0.0.1:9" set ALL_PROXY=

if not exist "venv\Scripts\python.exe" (
    echo [ERROR] Khong tim thay venv\Scripts\python.exe
    pause
    exit /b 1
)

call venv\Scripts\activate.bat
python -m backend.local_server
pause
