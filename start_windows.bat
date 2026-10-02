@echo off
chcp 65001 > nul
cls
cd /d "%~dp0"
echo ===================================================================
echo               E2Aubooks - Ebook to Audiobook AI Studio
echo               Trình khởi chạy nhanh Cục bộ (Windows Launcher)
echo ===================================================================
echo.

:: Kiểm tra Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [LOI] Khong tim thay Node.js tren may tinh!
    echo Vui long cai dat Node.js tai: https://nodejs.org/ (Phien ban LTS)
    pause
    exit /b 1
)

:: Kiểm tra thư mục node_modules
if not exist "node_modules\" (
    echo [+] Dang cai dat thu vien dependencies lan dau tien (npm install)...
    call npm install
    if %errorlevel% neq 0 (
        echo [LOI] Cai dat that bai! Vui long kiem tra ket noi mang.
        pause
        exit /b 1
    )
)

echo.
echo Chon che do phan cung:
echo   [1] Tu dong -- daemon do nvidia-smi (khuyen nghi)
echo   [2] Ep CPU da nhan (may khong co card NVIDIA)
echo.
set /p choice="Nhap lua chon cua ban (1 hoac 2, mac dinh la 1): "

rem Cả hai biến dưới đều tới daemon: pickDevice() đọc DEVICE, tts_daemon.py
rem đọc ONNX_THREADS cho onnxruntime. Không set thì daemon tự dò nvidia-smi.
if "%choice%"=="2" (
    echo.
    echo [*] Ep che do CPU da nhan...
    set DEVICE=cpu
    set ONNX_THREADS=4
)

rem 3222 là cổng app dùng chung với run.sh và scripts/audiobook.js.
rem Lưu ý: DEVICE/ONNX_THREADS set trong if ở trên vẫn tới daemon, vì
rem biến môi trường truyền sang tiến trình con, khác với %VAR% trong
rem cùng một khối (cmd giải lúc parse).
if "%PORT%"=="" set PORT=3222

echo.
echo [+] Dang khoi dong may chu E2Aubooks tai: http://localhost:%PORT%
echo [+] Nhan Ctrl + C de dung may chu.
echo.

start "" http://localhost:%PORT%

npx tsx server.ts
pause
