@echo off
setlocal
cd /d "%~dp0"

if "%HTTP_PROXY%"=="http://127.0.0.1:9" set HTTP_PROXY=
if "%HTTPS_PROXY%"=="http://127.0.0.1:9" set HTTPS_PROXY=
if "%ALL_PROXY%"=="http://127.0.0.1:9" set ALL_PROXY=

if not exist "venv\Scripts\python.exe" (
    echo Dang tao moi truong Python...
    python -m venv venv
    if errorlevel 1 goto :failed
)

call venv\Scripts\activate.bat
echo Dang cai dependencies backend local...
python -m pip install -r requirements.txt
if errorlevel 1 goto :failed

echo.
echo Extension da san sang, khong can npm de chay ban local.
echo.
echo 1. Mo chrome://extensions hoac edge://extensions
echo 2. Bat Developer mode
echo 3. Chon Load unpacked
echo 4. Chon thu muc:
echo    %~dp0extension_dist
echo 5. Chay run_extension_backend.bat
echo.
pause
exit /b 0

:failed
echo [ERROR] Khong the cai dat extension backend.
pause
exit /b 1
