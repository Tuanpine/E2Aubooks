# Hướng dẫn triển khai cục bộ — E2Aubooks

Tài liệu này đi kèm [README.md](README.md) (tính năng + API) và
[README_CLI.md](README_CLI.md) (batch headless).

## 1. Yêu cầu

| | |
|---|---|
| Hệ điều hành | Windows 10/11 64-bit, macOS, Linux |
| Node.js | 18 trở lên (khuyên 20 hoặc 22) — [nodejs.org](https://nodejs.org/) |
| Python | 3.10+ — chỉ khi chạy TTS cục bộ ngoài Docker |
| RAM | 4 GB trở lên cho CPU; thêm 4 GB VRAM nếu dùng VieNeu trên GPU |
| GPU | Tùy chọn. NVIDIA cần driver + (nếu chạy Docker) NVIDIA Container Toolkit |

Ba model nặng lần lượt ~262 MB, ~333 MB, ~145 MB — tải qua app, không cần tải tay.

## 2. Chạy bằng launcher

```bash
npm install
./start_linux_mac.sh      # Windows: chạy start_windows.bat
```

Launcher hỏi chế độ phần cứng (tự dò qua `nvidia-smi`, hoặc ép CPU), tự `npm install`
lần đầu, rồi mở `http://localhost:3222`.

Chạy thẳng không qua launcher:

```bash
npm run dev              # PORT mặc định 3000
PORT=3222 npm run dev
```

## 3. Chạy bằng Docker

```bash
# CPU
docker compose up -d --build && docker logs -f e2aubooks

# GPU (cần NVIDIA Container Toolkit)
docker compose --profile gpu up -d --build && docker logs -f e2aubooks-gpu

docker compose down
```

Cổng publish ra host nằm trong `docker-compose.yml` (mặc định 8080).

## 4. Tải model

Mở app → **Mô hình TTS** → **Kiểm tra link** (HEAD từng file, so kích thước thật) →
**Tải về**. File nằm ở `models/<model-id>/`.

| id | Nguồn HuggingFace |
|---|---|
| `vieneu-tts-v3-turbo` | `pnnbao-ump/VieNeu-TTS-v3-Turbo` |
| `kokoro-vietnamese` | `contextboxai/Kokoro-Vietnamese` |
| `mms-tts-vie` | `facebook/mms-tts-vie` |

Danh sách và URL lấy từ `src/data/modelCatalog.ts` — sửa ở đó, không sửa ở UI.

## 5. Cấu hình phần cứng

`.env` (copy từ `.env.example`):

```env
PORT=3000
DEVICE=cuda          # 'cuda' | 'cpu'
ONNX_THREADS=4       # nên bằng số nhân vật lý
TTS_MODELS_DIR=./models
TTS_IDLE_TIMEOUT_MS=300000
```

Các biến khác: `TTS_PYTHON`, `TTS_DAEMON`, `VIENEU_SRC`, `FFMPEG_BIN`,
`TTS_PORT_OFFSET`, `TTS_MAX_CHARS`, `LIBRARY_DIR` — xem `server/` để biết chúng
dùng ở đâu. Trong Docker, `TTS_PYTHON` / `TTS_DAEMON` / `VIENEU_SRC` đã được
`Dockerfile` trỏ sẵn.

## 6. Chạy hai instance song song

```bash
./run.sh 3222              # instance 1, daemon 9980-9982
./run.sh 3223 cuda:1 10    # instance 2, daemon 9990-9992
```

Tham số: `cổng_app`, `GPU`, `độ_lệch_cổng_daemon`. Thiếu tham số thứ ba thì hai
instance cùng tranh một cặp cổng daemon.

## 7. Cấu trúc dự án

Xem mục [1. Cấu trúc thư mục](README.md#1-cấu-trúc-thư-mục) trong README — giữ
một nguồn duy nhất để không trôi khỏi code.
