# VieNeu-TTS — mã nguồn được vendor

Thư mục này **không phải** code của E2Aubooks. Nó là bản sao nguyên vẹn của
VieNeu-TTS, được đặt vào repo để image Docker build được ngoài mạng.

## Nguồn gốc

| | |
|---|---|
| Dự án | VieNeu-TTS |
| Upstream | https://github.com/pnnbao97/VieNeu-TTS |
| Commit | `2cc1d41a3640b76287d300e3d4677d2f30aac9ed` (2026-07-04) |
| Phiên bản | 3.0.11 (`v3.0.10-6-g2cc1d41`) |
| Giấy phép | Apache License 2.0 — xem [`LICENSE-vieneu.txt`](LICENSE-vieneu.txt) |

## Đã chỉnh sửa gì?

**Không có.** Toàn bộ 30 file `.py` / `.json` dưới đây giống hệt upstream tại commit
trên (đối chiếu từng byte):

- `vieneu/` — API công khai, engine v3 turbo, phục vụ batching/cudagraph
- `vieneu/assets/` — danh mục giọng đọc
- `vieneu_utils/` — tiện ích phiên âm và tải model

Mọi tuỳ chọn tích hợp của E2Aubooks (daemon, cổng, `DEVICE`, `TTS_IDLE_TIMEOUT_MS`)
đặt ở `scripts/` và `docker/`, **không** sửa trong thư mục này — nhờ vậy có thể
đồng bộ lại upstream bằng cách thay thế thẳng thư mục.

## Khi cần cập nhật VieNeu

```bash
git clone https://github.com/pnnbao97/VieNeu-TTS /tmp/vnup
git -C /tmp/vnup checkout <commit-mới>
rm -rf docker/tts/vieneu-src/{vieneu,vieneu_utils}
cp -r /tmp/vnup/src/{vieneu,vieneu_utils} docker/tts/vieneu-src/
```

Kiểm tra lại bằng `diff -r` trước khi commit. Nếu phải sửa gì để chạy được, sửa
ở `scripts/` hoặc ghi rõ vào mục trên — đừng sửa lặng lẽ trong mã upstream.

## Ghi chú bản quyền

Apache-2.0 cho phép vendor và phân phối lại, kèm điều kiện phải giữ lại thông
báo bản quyền và nêu nguồn. File `LICENSE-vieneu.txt` giữ nguyên thông báo đó.
