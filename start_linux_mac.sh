#!/usr/bin/env bash

# ===================================================================
# E2Aubooks - Ebook to Audiobook AI Studio
# Trình khởi chạy nhanh Cục bộ (Linux / macOS Launcher)
# ===================================================================

set -e
cd "$(dirname "$0")"

echo "==================================================================="
echo "              E2Aubooks - Ebook to Audiobook AI Studio             "
echo "              Trình khởi chạy nhanh Cục bộ (Linux / macOS)         "
echo "==================================================================="
echo ""

# Kiểm tra Node.js
if ! command -v node &> /dev/null; then
    echo "[LỖI] Chưa cài đặt Node.js trên máy!"
    echo "Vui lòng cài đặt Node.js từ https://nodejs.org/"
    exit 1
fi

# Cài đặt dependencies nếu chưa có
if [ ! -d "node_modules" ]; then
    echo "[+] Đang cài đặt thư viện dependencies lần đầu (npm install)..."
    npm install
fi

# Lựa chọn phần cứng. Cả hai biến dưới đều tới daemon: pickDevice() đọc
# DEVICE, và tts_daemon.py đọc ONNX_THREADS cho onnxruntime. Bỏ lựa chọn này
# thì daemon tự dò qua nvidia-smi (xem server/ttsSupervisor.ts).
echo ""
echo "Chọn chế độ phần cứng:"
echo "  1) Tự động — daemon dò nvidia-smi (khuyến nghị)"
echo "  2) Ép CPU đa nhân (máy không có card NVIDIA)"
read -p "Nhập lựa chọn của bạn (1 hoặc 2, mặc định là 1): " choice

if [ "$choice" = "2" ]; then
    echo ""
    echo "[*] Ép chế độ CPU đa nhân..."
    export DEVICE=cpu
    export ONNX_THREADS=4
else
    echo ""
    echo "[*] Tự động: GPU nếu có, không thì CPU."
    unset DEVICE
fi

# 3222 là cổng app dùng chung với ./run.sh và scripts/audiobook.js. Mở 3000
# ở đây khiến link trong tài liệu và trình duyệt tự mở trỏ vào cổng chết.
PORT="${PORT:-3222}"
export PORT

echo ""
echo "[+] Máy chủ đang khởi chạy tại: http://localhost:$PORT"
echo "[+] Nhấn Ctrl + C để dừng máy chủ."
echo ""

# Tự động mở trình duyệt nếu có hỗ trợ
if command -v xdg-open &> /dev/null; then
    xdg-open "http://localhost:$PORT" &
elif command -v open &> /dev/null; then
    open "http://localhost:$PORT" &
fi

exec npx tsx server.ts