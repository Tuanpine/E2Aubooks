# audiobook CLI

Chuyển ebook sang audiobook **không cần mở trình duyệt**. Dành cho việc kéo dài nhiều
giờ: xuất một cuốn dài qua giao diện web phải giữ tab mở suốt quá trình, và tab
có thể chết giữa chừng. Ở đây tiến trình thuộc terminal nên chạy overnight an toàn.

---

## 1. Chuẩn bị (chỉ làm một lần)

Cần hai thứ chạy song song:

**a. Khởi động server** — mở một terminal, để nguyên terminal đó:

```bash
cd ~/e2aubooks
./run.sh 3222
```

Báo `E2Aubooks server running on port 3222` là được. Terminal này phải mở suốt
quá trình chuyển đổi.

**b. Đặt ebook vào hàng đợi** — copy file `.epub` / `.mobi` / `.pdf` / `.docx`
vào thư mục `ebooks_queue/`:

```bash
cp ~/Downloads/*.epub ~/e2aubooks/ebooks_queue/
```

---

## 2. Chạy

**Xem có gì trong hàng đợi:**

```bash
cd ~/e2aubooks
node scripts/audiobook.js --list
```

**Chuyển một cuốn:**

```bash
node scripts/audiobook.js "ebooks_queue/Xứ Tuyết.epub"
```

**Chuyển tất cả ebook trong hàng đợi (chạy cả đêm):**

```bash
node scripts/audiobook.js --all
```

File kết quả nằm trong `audiobooks_output/`.

---

## 3. Xem tiến độ

Màn hình hiện thanh tiến trình:

```
  ████████████████████████████░░░░░░░░░░░░░░░░░░░░░░  57%   1782/3284 câu  63.4 phút audio  còn ~48 phút
```

Ý nghĩa:

| Cột | Ý nghĩa |
|---|---|
| `57%` | đã xong 57% số câu |
| `1782/3284 câu` | câu hiện tại / tổng số câu |
| `63.4 phút audio` | thời lượng audio đã tạo ra |
| `còn ~48 phút` | ước tính thời gian còn lại |

Sau khi xong, dòng cuối hiện thời lượng và dung lượng thật:

```
   ✓ Xứ Tuyết.wav  288.6 phút  831.2 MB
```

**Muốn chạy nền không cần nhìn màn hình:**

```bash
nohup node scripts/audiobook.js --all > audiobook.log 2>&1 &
tail -f audiobook.log     # xem tiến đình khi muốn
```

---

## 4. Các tuỳ chọn

| Tuỳ chọn | Ý nghĩa | Ví dụ |
|---|---|---|
| `--list` | Xem ebook trong hàng đợi | `--list` |
| `--all` | Chuyển mọi ebook trong hàng đợi | `--all` |
| `--input <thư mục>` | Thư mục chứa ebook | `--input ~/Books` |
| `--output <thư mục>` | Nơi lưu kết quả | `--output ~/Audiobooks` |
| `--voice "<tên>"` | Chọn giọng đọc | `--voice "Ngọc Lan"` |
| `--engine <id>` | `vieneu` \| `mms` \| `kokoro` | `--engine mms` |
| `--format wav\|mp3` | Định dạng đầu ra | `--format mp3` |
| `--gap <giây>` | Im lặng giữa các câu | `--gap 0.5` |
| `--speed <hệ số>` | Đổi tốc độ đọc, giữ nguyên cao độ (mặc định `1`) | `--speed 1.25` |
| `--from <câu>` | Bắt đầu từ câu thứ N | `--from 1000` |
| `--restart` | Làm lại cả những cuốn đã xong | `--restart` |
| `--to <câu>` | Dừng ở câu thứ N | `--to 1500` |
| `--app <url>` | Địa chỉ server | `--app http://127.0.0.1:3223` |
| `--help` | Xem màn trình trợ giúp | `--help` |

**Về `--speed`:** chỉ engine **Kokoro** nhận trực tiếp tốc độ từ trong model. VieNeu
và MMS dừng ở end token nên không thể đổi nhịp lúc sinh; với hai engine này
`--speed` được áp **sau khi** ghép bằng ffmpeg `atempo` (nên cần ffmpeg, và giữ
nguyên cao độ). Ưu tiên Kokoro nếu cần tốc độ khác 1.

### Các giọng có sẵn — 41 giọng

| Engine | Số giọng | Ghi chú |
|---|---|---|
| VieNeu-TTS v3 Turbo | **25** | 48 kHz, miền Bắc/Trung/Nam, nhiều kiểu đọc |
| Kokoro-Vietnamese | **14** | 24 kHz, ONNX, chạy tốt trên CPU |
| Meta MMS | **2** | Nam / Nữ |

Xem danh sách đầy đủ (phải chỉ định engine):

```bash
curl -s "http://127.0.0.1:3222/api/tts/voices?engine=vieneu" | python3 -m json.tool
curl -s "http://127.0.0.1:3222/api/tts/voices?engine=kokoro" | python3 -m json.tool
```

Mặc định là `Hải Đăng` (giọng nam Bắc, phong cách tự nhiên — lựa chọn mặc định của SDK).

Vài giọng thường dùng:

| Giọng | Engine | Giới tính | Vùng |
|---|---|---|---|
| `Hải Đăng` | vieneu | Nam | Bắc |
| `Mai Anh` | vieneu | Nữ | Bắc |
| `Đoan Trang` | vieneu | Nữ | Bắc |
| `Quang Sơn` | vieneu | Nam | Trung |
| `Thái Sơn` | vieneu | Nam | Nam |
| `Diễm Trinh` | kokoro | Nữ | — |
| `Tuấn Ngọc` | kokoro | Nam | — |

Nếu gõ sai tên, chương trình báo lỗi và **liệt kê các giọng thật** rồi dừng ngay,
không chạy tới cuối mới báo. Tên có dấu: `Hải Đăng`, không phải `Hai Dang`.

**Cần engine khác?** Thêm `--engine kokoro` để chuyển:

```bash
node scripts/audiobook.js --all --engine kokoro --voice "Diễm Trinh"
```

Cũng phải chỉ rõ `--voice`, vì mỗi engine có bộ giọng riêng.

---

## 5. Dừng giữa chừng và chạy tiếp

**Dừng:** nhấn `Ctrl+C`.

Chương trình ghi nhớ cuốn nào đã xong vào
`audiobooks_output/.audiobook-progress.json`. Chạy lại cùng lệnh, nó **bỏ qua**
những cuốn đã hoàn thành và làm tiếp phần còn lại:

```bash
node scripts/audiobook.js --all
```

Muốn làm lại từ đầu:

```bash
node scripts/audiobook.js --all --restart
```

Nếu đổi giọng hoặc engine, cuốn cũ tự được coi như chưa làm — khoá lưu theo
`tên file + giọng + engine + định dạng`.

**Xuất đúng một đoạn** (dùng để thử trước):

```bash
node scripts/audiobook.js "Xứ Tuyết.epub" --from 1500 --to 2000
```

Lưu ý: mỗi lần chạy tạo một file mới. Muốn ghép các đoạn:

```bash
ffmpeg -f concat -safe 0 -i <(echo "file 'a.wav'"; echo "file 'b.wav'") -c copy full.wav
```

---

## 6. Chạy song song trên 2 GPU

Máy có nhiều GPU thì mở thêm terminal, mỗi terminal một GPU:

```bash
cd ~/e2aubooks
./run.sh 3223 cuda:1 10
```

Ba tham số lần lượt là: cổng app, GPU, và **độ lệch cổng daemon**. Thiếu tham số
thứ ba thì instance thứ hai vẫn dùng cổng daemon 9980-9982 của instance đầu, nên
hai app tranh nhau. Offset `10` đẩy nó sang 9990-9992.

Rồi ở terminal thứ ba chạy song song hai tiến trình, mỗi tiến trình một nửa
(trỏ `--app` về đúng cổng của từng instance):

```bash
node scripts/audiobook.js "sach-1.epub" --app http://127.0.0.1:3222 --output ~/Audiobooks &
node scripts/audiobook.js "sach-2.epub" --app http://127.0.0.1:3223 --output ~/Audiobooks
```

Hai tiến trình này dùng hai GPU khác nhau nên tổng thời gian giảm khoảng một nửa.

---

## 7. Xử lý sự cố

**"Không kết nối được server"**
Server chưa chạy. Mở terminal khác và chạy `./run.sh 3222`.

**"Giọng ... không tồn tại"**
Gõ sai tên giọng. Chương trình in ra danh sách giọng thật — chép đúng một tên.
Lưu ý tên có dấu và cách viết: `Hải Đăng` chứ không phải `Hai Dang`, và tên phải
khớp với `--engine` đang dùng (giọng của Kokoro không có trong danh sách VieNeu).

**"Xuất xong nhưng nghe toàn "bíp bíp"**
Daemon trả về WAV sai định dạng (float32 trong khi client đọc int16). Đã sửa.
Nếu vẫn thấy, khởi động lại server để daemon nạp code mới:

```bash
# Terminal đang chạy server: Ctrl+C
./run.sh 3222
```

**Nghe ra giọng nước ngoài (Thái/Lào) với VieNeu**
Engine phải được gọi với `phonemes=` chứ không phải `text=`. Đã sửa trong daemon.
Nếu vẫn thấy, chắc chắn daemon cũ đang chạy — restart server như trên.
Kokoro-Vietnamese không bị lỗi này.

**Xuất dừng giữa chừng không rõ lý do**
Xem `audiobook.log` nếu bạn chạy bằng `nohup`, hoặc chạy lại không cần `nohup` để
thấy lỗi ngay trên màn hình.

**"Unknown encoding" khi xuất MP3**
Thiếu `ffmpeg`. Kiểm tra: `ffmpeg -version`. Nếu chưa có, xuất WAV:
`--format wav`.

**Muốn nghe thử trước khi xuất cả cuốn**
```bash
node scripts/audiobook.js "sach.epub" --to 5 --output /tmp/thu
```

---

## 8. Về tốc độ

Tốc độ phụ thuộc GPU. Với GPU tầm trung, VieNeu tạo audio nhanh gấp khoảng 4 lần
thời lượng thật — tức một cuốn audiobook 5 giờ cần khoảng 75 phút máy.

| Engine | Tốc độ | Ghi chú |
|---|---|---|
| VieNeu (GPU) | nhanh nhất | 48 kHz, chất lượng cao |
| Kokoro VN (CPU) | trung bình | nhẹ, không cần GPU |
| Meta MMS (CPU) | nhanh | chất lượng thấp hơn |

| Việc | Thời gian ước tính |
|---|---|
| Cuốn 1 giờ audio | ~15 phút |
| Cuốn 3 giờ audio | ~45 phút |
| Xứ Tuyết (~4.8 giờ) | ~70-80 phút |

Muốn nhanh hơn nữa: dùng 2 GPU như mục 6.