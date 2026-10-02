# E2Aubooks (Ebook to Audiobook AI Studio)

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19.0-61dafb?logo=react)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8.x-646CFF?logo=vite)](https://vitejs.dev/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-4.x-38B2AC?logo=tailwind-css)](https://tailwindcss.com/)
[![NVIDIA CUDA](https://img.shields.io/badge/Hardware-NVIDIA_CUDA_%2F_CPU-76B900?logo=nvidia)](https://developer.nvidia.com/cuda-zone)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker)](https://www.docker.com/)

> **E2Aubooks** chuyển sách điện tử (**EPUB, MOBI/AZW, PDF, DOCX, TXT, Markdown**) thành sách nói bằng mô hình TTS chạy **hoàn toàn cục bộ**: **VieNeu-TTS v3 Turbo**, **Kokoro Vietnamese**, **Meta MMS Vietnamese**, cộng thêm giọng `Web Speech` có sẵn của trình duyệt. Chạy được trên CPU, hoặc GPU NVIDIA qua CUDA — trong container hoặc ngoài máy.

Mọi trọng số model tải về máy, không có lời gọi API đám mây nào trong đường chính.

---

## 📑 Mục lục
1. [Cấu trúc thư mục](#1-cấu-trúc-thư-mục)
2. [Tính năng](#2-tính-năng)
3. [Mô hình TTS & giọng đọc](#3-mô-hình-tts--giọng-đọc)
4. [API HTTP](#4-api-http)
5. [Cài đặt & Build](#5-cài-đặt--build)
6. [Docker](#6-docker)
7. [Lưu ý kỹ thuật](#7-lưu-ý-kỹ-thuật)
8. [Giấy phép](#8-giấy-phép)

---

## 1. Cấu trúc thư mục

```text
e2aubooks/
├── run.sh                        # Launcher Linux/macOS (nhận cổng app, DEVICE, TTS_PORT_OFFSET)
├── start_windows.bat             # Launcher Windows
├── start_linux_mac.sh            # Launcher Linux/macOS hỏi chế độ phần cứng
├── Dockerfile                    # Multi-stage: build Node 22 / TTS CPU / TTS GPU / runtime
├── docker-compose.yml            # Service `e2aubooks` (CPU) và `e2aubooks-gpu` (profile gpu)
├── docker/up.sh                  # Build + khởi động compose
├── .env.example                  # PORT, DEVICE, ONNX_THREADS, TTS_* , FFMPEG_BIN
├── server.ts                     # Express: thư viện, TTS, model, health
├── server/
│   ├── library.ts                # Thư viện SQLite (node:sqlite) — sách đã nạp + audio đã render
│   ├── modelDownloader.ts        # Tải model từ HuggingFace nền, verify URL, báo % và MB/s
│   └── ttsSupervisor.ts          # Spawn/tắt daemon TTS theo yêu cầu, timeout theo nhàn rỗi
├── docker/
│   ├── requirements-tts.txt      # Torch/ONNX/soundfile/sea-g2p/vig2p cho daemon
│   ├── tts/tts_daemon.py        # HTTP daemon: /synthesize, /voices, /health
│   └── tts/vieneu-src/           # Mã VieNeu-TTS vendor (Apache-2.0) — xem README trong đó
├── scripts/
│   ├── audiobook.js              # CLI batch headless (xem README_CLI.md)
│   ├── gen_voices.py             # Sinh src/data/voices.ts từ manifest của model
│   ├── check_ambient.ts          # Test 5 nhạc nền tổng hợp (RMS/peak)
│   ├── check_catalog.ts          # Test catalog model + giọng khớp daemon
│   ├── check_tts_output.py       # Test đầu ra TTS (cần model đã tải)
│   ├── check_wav_rate.ts         # Test sample rate WAV xuất ra
│   └── make_test_epub.js         # Tạo EPUB mẫu để thử
└── src/
    ├── App.tsx                   # Studio chính: teleprompter, điều khiển, điều phối modal
    ├── data/
    │   ├── modelCatalog.ts       # 3 model TTS verified (nguồn duy nhất cho server + UI)
    │   ├── voices.ts             # 41 giọng — sinh từ scripts/gen_voices.py, ĐỪNG sửa tay
    │   └── sampleBooks.ts        # 2 cuốn sách mẫu nạp sẵn (Dế Mèn, Hoàng Tử Bé)
    ├── components/               # 10 modal: Voice, Model, Cast&Emotion, Pronunciation,
    │                             # Batch, Export, Library, Uploader, ChapterDrawer, Visualizer
    ├── utils/
    │   ├── ebookParser.ts        # Bóc EPUB/MOBI(PalmDOC LZ77)/PDF/DOCX/TXT/MD + tách câu, chương
    │   ├── audioEngine.ts        # Phát, hòa âm, ghép WAV 24 kHz 16-bit, gọi MP3
    │   ├── ambientSoundscapes.ts # 5 nhạc nền tổng hợp offline qua Web Audio API
    │   ├── dialogueCaster.ts     # Tách lời dẫn/đối thoại, gán vai nam/nữ, chọn giọng
    │   ├── emotionTagger.ts      # 8 thẻ cảm xúc tiếng Việt, quét theo ngữ cảnh văn bản
    │   ├── pronunciationLexicon.ts # 21 quy tắc đọc: đơn vị, viết tắt, số La Mã, tên riêng
    │   ├── hardwareDetector.ts   # Đọc /api/health (nvidia-smi + số nhân CPU)
    │   └── library.ts            # Client gọi API thư viện
    └── types/{ebook,models}.ts   # Kiểu dữ liệu dùng chung
```

**Không có** thư mục `src/data/` nào bị ignore: dòng `/data/` trong `.gitignore` đã neo ở gốc để không nuốt mất catalog giọng và model.

---

## 2. Tính năng

### 2.1. Nạp & bóc sách
| Định dạng | Cách bóc |
|---|---|
| EPUB (2 & 3) | Giải nén ZIP (JSZip), đọc `container.xml` → OPF → spine, lấy ảnh bìa, tách từng chương |
| MOBI / AZW / AZW3 | Đọc PDB header, giải nén PalmDOC LZ77, bóc văn bản |
| PDF | `pdfjs-dist`, ghép đoạn theo tọa độ ngắt dòng |
| DOCX | `linkedom` đọc `word/document.xml`, heading → chương |
| TXT / Markdown | Dò mẫu `Chương N`, `Hồi N`, `Chapter N`, `# Tiêu đề` |

Sách 0 chương bị **từ chối ngay** (HTTP 422) kèm giải thích — PDF scan không có lớp chữ cần OCR trước, không phải tệp hỏng.

### 2.2. Đọc & điều khiển
- Teleprompter tự cuộn theo câu đang phát (`scrollIntoView`).
- Bấm vào câu bất kỳ để nhảy tới và đọc ngay.
- Tốc độ `0.5x – 3.0x` (preset + slider), cao độ `0.6 – 1.4`, âm lượng + tắt tiếng.
- Hẹn giờ dừng: 15 / 30 / 60 phút.
- Tự lưu vị trí đọc (`e2aubooks_reading_progress`) vào `localStorage`.
- 6 chủ đề (`dark`, `light`, `gray`, `sepia`, `paper`, `obsidian`) × 6 phông (`literata`, `merriweather`, `lora`, `roboto-slab`, `inter`, `mono`).
- Ngăn kéo mục lục chương, biểu đồ sóng thời gian thực.

### 2.3. Đọc đa vai & cảm xúc
- `dialogueCaster.ts` tách lời dẫn chuyện với lời thoại trong dấu ngoặc kép, gán vai `narrator` / `male_lead` / `female_lead` theo ngữ cảnh quanh câu, rồi map sang 3 giọng độc lập trong UI.
- `emotionTagger.ts` gắn 1 trong 8 thẻ: `[cười]`, `[thở dài]`, `[ngạc nhiên]`, `[thì thầm]`, `[tức giận]`, `[buồn bã]`, `[hồi hộp]`, `[nghẹn ngào]`.
- Thẻ hiển thị trên màn hình đọc và **được gỡ bỏ ở server** trước khi tổng hợp (`EMOTION_TAG_RE` trong `server.ts`) — để không bị đọc thành tiếng.

### 2.4. Chuẩn hóa phát âm
`pronunciationLexicon.ts` có **21 quy tắc mặc định** trong 3 nhóm:
- **Đơn vị** (7): `km/h`, `km`, `kg`, `%`, `°C`, `VND/đ`, `$`.
- **Viết tắt & số La Mã** (9): `TP.HCM`, `TP.HN`, `PGS.TS`, `GS.TS`, `ThS`, `AI`, `thế kỷ XXI/XX/XIX`.
- **Tên riêng** (5): `Sherlock Holmes`, `John Watson`, `Harry Potter`, `Hermione`, `Voldemort`.

Áp dụng cho mọi câu trước khi đọc. `PronunciationLexiconModal` cho thêm/sửa/tắt quy tắc với **Live Preview** và lưu vào `localStorage`.

### 2.5. Nhạc nền offline
`ambientSoundscapes.ts` tổng hợp bằng Web Audio API, không cần file nhạc: `rain`, `fireplace`, `waves`, `night`, `lofi`, cộng `none`. Âm lượng 5%–60%, hòa trực tiếp vào luồng PCM trước khi ghi WAV.

### 2.6. Xuất & lưu trữ
- **WAV 24 kHz mono 16-bit PCM**, ngắt câu 0.35 s, nhạc nền đã hòa.
- **MP3** tuỳ chọn (96/128/192/320 kbps) qua `ffmpeg`; không có `ffmpeg` thì giữ WAV.
- Lưu vào thư viện SQLite (sách + audio) để mở lại sau; tải/xoá từ `LibraryModal`.

> Metadata hiện chỉ hiển thị ở hộp thoại xuất — **chưa nhúng tag ID3 thật** vào file âm thanh.

### 2.7. Batch & thư viện
- `BatchConvertModal`: kéo thả nhiều sách, tiến độ từng cuốn, **GPU Cooldown** giữa các cuốn, xuất tệp ngay khi xong.
- CLI `scripts/audiobook.js` chạy nền không cần trình duyệt, có checkpoint để chạy lại tiếp — xem [README_CLI.md](README_CLI.md).

---

## 3. Mô hình TTS & giọng đọc

`src/data/modelCatalog.ts` là nguồn duy nhất (server và UI cùng đọc):

| id | Engine | HF repo | Dung lượng | VRAM | Ghi chú |
|---|---|---|---:|---:|---|
| `vieneu-tts-v3-turbo` | `vieneu` | `pnnbao-ump/VieNeu-TTS-v3-Turbo` | ~262 MB | ~3.5 GB | 48 kHz, chất lượng cao nhất |
| `kokoro-vietnamese` | `kokoro` | `contextboxai/Kokoro-Vietnamese` | ~333 MB | ~0.5 GB | 24 kHz, 14 voice pack |
| `mms-tts-vie` | `mms` | `facebook/mms-tts-vie` | ~145 MB | ~1 GB | 16 kHz, nhẹ nhất |

Tải qua UI **Quản lý mô hình** (verify link trước, tải nền, huỷ được) hoặc CLI. Trọng số nằm ở `models/<id>/` (git-ignore, mount volume trong Docker).

**Giọng đọc: 41** (`src/data/voices.ts`, sinh bằng `npm run voices`)

| Engine | Số giọng | Ghi chú |
|---|---:|---|
| VieNeu v3 Turbo | 25 | 14 nam / 11 nữ; Bắc 15, Nam 8, Trung 2 |
| Kokoro Vietnamese | 14 | Manifest model không khai báo giới tính — UI gán `male` |
| Meta MMS | 2 | Nhãn `Nam` / `Nữ` (một waveform, khác nhau ở rate/pitch) |

Thêm `Web Speech` của trình duyệt (`native`) làm lựa chọn dự phòng, không cần model.

---

## 4. API HTTP

Express trong `server.ts`, cổng lấy từ `PORT` (mặc định **3000**; `run.sh` mặc định **3222**).

### Thư viện
| Method | Path | Việc |
|---|---|---|
| GET | `/api/library/books` | Danh sách sách đã nạp |
| GET | `/api/library/books/:id` | Chi tiết một cuốn |
| POST | `/api/library/books` | Nạp sách (`file_name` + `data_base64`), tự bóc và lưu |
| DELETE | `/api/library/books/:id` | Xoá sách |
| GET | `/api/library/audio` | Danh sách audio đã render |
| POST | `/api/library/audio` | Lưu audio (raw body + `?name=&voice=&engine=`, tối đa 4 GB) |
| GET | `/api/library/audio/:id/download` | Tải tệp |
| DELETE | `/api/library/audio/:id` | Xoá audio |

### TTS
| Method | Path | Việc |
|---|---|---|
| GET | `/api/health` | Trạng thái + phần cứng (`nvidia-smi`, số nhân CPU) + engine nào đang chạy |
| POST | `/api/tts/local` | Tổng hợp 1 đoạn. Body `{text, voice, engine, speed, format}`. Giới hạn `TTS_MAX_CHARS` (mặc định 1200) |
| GET | `/api/tts/voices?engine=` | Giọng mà engine đang chạy thực sự có |
| POST | `/api/tts/start` / `stop` | Bật/tắt daemon thủ công |
| POST | `/api/tts/encode-mp3` | WAV base64 → MP3 base64. **501** nếu thiếu `ffmpeg` |
| POST | `/api/parse` | Bóc sách trên đĩa, trả metadata + chương. Chỉ nhận path trong thư mục dự án |

### Model
| Method | Path | Việc |
|---|---|---|
| GET | `/api/models` | Catalog + trạng thái cài đặt trong `models/` |
| POST | `/api/models/verify/:modelId` | HEAD từng file, so kích thước thực tế |
| POST | `/api/models/download` | Bắt đầu tải nền |
| GET | `/api/models/progress/:modelId` | %, byte đã tải, MB/s |
| POST | `/api/models/cancel/:modelId` | Huỷ tải |
| DELETE | `/api/models/:modelId` | Xoá model khỏi đĩa |

---

## 5. Cài đặt & Build

**Yêu cầu**: Node.js 18/20/22, npm, Python 3.10+ (chỉ khi chạy TTS cục bộ ngoài Docker).

```bash
npm install
cp .env.example .env
npm run dev          # http://localhost:3000
```

Mở app, vào **Quản lý mô hình** để tải ít nhất một model, rồi chọn giọng.

```bash
npm run lint         # tsc --noEmit
npm run build        # vite build -> dist/
npm start            # chạy server.ts, phục vụ cả dist/ lẫn /api
npm test             # lint + check_ambient + check_catalog
npm run test:tts     # cần model đã tải
npm run voices       # sinh lại src/data/voices.ts từ manifest
```

**Launcher 1-click**: `start_windows.bat` (Windows) hoặc `./start_linux_mac.sh` (Linux/macOS) — hỏi phần cứng rồi chạy ở cổng `3222`.

Chạy song song hai instance (ví dụ hai GPU):
```bash
./run.sh 3223 cuda:1 10     # app cổng 3223, daemon dịch cổng 10
```

---

## 6. Docker

Yêu cầu cho chế độ GPU: [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html).

```bash
# CPU (mặc định)
docker compose up -d --build && docker logs -f e2aubooks

# GPU
docker compose --profile gpu up -d --build && docker logs -f e2aubooks-gpu

docker compose down
```

Image build theo tầng `build` (Node 22) → `tts-cpu` / `tts-gpu` (Python 3.12 + torch/ONNX) → `runtime-cpu` / `runtime-gpu`. Bản GPU đặt sẵn `DEVICE=cuda`, `TORCH_DTYPE=float16`. `models/`, `data/`, `audiobooks_output/`, `ebooks_queue/` là volume, không nằm trong image.

---

## 7. Lưu ý kỹ thuật

1. **Autoplay policy** — Chrome/Safari/Firefox chặn `AudioContext` và `speechSynthesis` trước lần tương tác đầu tiên. `audioEngine.ts` và `ambientSoundscapes.ts` gọi `ctx.resume()` khi có tương tác; đừng xoá.
2. **Giới hạn độ dài câu** — VieNeu đẩy toàn bộ prompt lên GPU; một đoạn 400 câu đòi ~16.6 GiB và OOM card 12 GB. `server.ts` chặn ở `TTS_MAX_CHARS` (1200) và yêu cầu chia nhỏ trước. Client đã gửi từng câu một; guard này bảo vệ CLI batch và mọi caller sau này.
3. **Daemon được spawn theo yêu cầu** — `ttsSupervisor.ts` bật daemon khi cần và tự tắt sau `TTS_IDLE_TIMEOUT_MS` (mặc định 20 phút) để không giữ trọng số trong RAM. Cổng: `vieneu` 9980, `mms` 9981, `kokoro` 9982, cộng `TTS_PORT_OFFSET`.
4. **PalmDOC LZ77** — byte `0x00` giữ nguyên; `0x01–0x08` sao chép N byte; `0x80–0xBF` đọc 2 byte tính distance/ length; `0xC0–0xFF` giải mã `b ^ 0x80`. Sửa ở `ebookParser.ts` phải kèm tệp nhị phân đối chiếu.
5. **Sách lớn** — dữ liệu chia theo `EbookChapter[]`; chỉ chương hiện tại vào state đọc. Đừng nối toàn bộ sách vào một string.
6. **`DEVICE`** — `cuda` dùng `bfloat16` (khớp SDK chính thức), `cpu` dùng `float32`. `ONNX_THREADS` nên bằng số nhân vật lý, tránh nghẽn luồng CPU.
7. **`src/data/` phải được commit** — `.gitignore` dùng `/data/` neo gốc. Đổi thành `data/` sẽ khiến clone mới thiếu catalog và app không khởi động được.
8. **Sửa danh mục giọng?** Sửa `scripts/gen_voices.py` rồi chạy `npm run voices`. `src/data/voices.ts` được sinh ra, sửa tay sẽ bị mất.

---

## 8. Giấy phép

**Apache License 2.0** — xem [LICENSE](LICENSE).

Mã của bên thứ ba trong `docker/tts/vieneu-src/` giữ giấy phép và thông báo gốc tại [`docker/tts/vieneu-src/README.md`](docker/tts/vieneu-src/README.md).
