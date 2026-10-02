#!/usr/bin/env node
/**
 * audiobook — chuyển ebook sang audiobook, chạy headless (không cần trình duyệt).
 *
 * Dành cho việc kéo dài nhiều giờ: xuất một cuốn dài qua UI sẽ giữ tab mở và
 * có thể chết. Ở đây tiến trình là của terminal nên chạy overnight an toàn.
 *
 * Tự tìm server đang chạy, tự nạp model khi cần, ghi file tạm rồi mới đổi tên
 * nên Ctrl+C không để lại file nửa vời.
 *
 *   node scripts/audiobook.js --list
 *   node scripts/audiobook.js "Xứ Tuyết.epub"
 *   node scripts/audiobook.js --all
 *   node scripts/audiobook.js --all --voice "Ngọc Lan"
 *
 * Xem README_CLI.md để biết đầy đủ.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const DEFAULTS = {
  app: 'http://127.0.0.1:3222',
  voice: 'Hải Đăng',
  engine: 'vieneu',
  format: 'wav',
  gap: 0.35,          // seconds of silence between sentences
  speed: 1,           // 1 = as synthesized; see --speed
  sampleRate: 24000,  // only a fallback when the daemon omits sample_rate
};

const SUPPORTED = ['.epub', '.mobi', '.azw', '.azw3', '.pdf', '.docx', '.txt', '.md'];

// The server strips these before synthesis, but the CLI also renders .txt/.md
// locally and a stray cue reads aloud as a different narrator. Matches
// SUPPORTED_EMOTIONS in src/utils/emotionTagger.ts.
const EMOTION_TAG_RE =
  /\[(cười|thở dài|ngạc nhiên|thì thầm|tức giận|buồn bã|hồi hộp|nghẹn ngào)\]/gi;
const stripCues = text => text.replace(EMOTION_TAG_RE, '').replace(/\s{2,}/g, ' ').trim();

// ---------------------------------------------------------------- CLI parsing

const HELP = `
audiobook — chuyển ebook sang audiobook headless

  node scripts/audiobook.js --list
  node scripts/audiobook.js "đường/dẫn/đến/sách.epub"
  node scripts/audiobook.js --all
  node scripts/audiobook.js --all --voice "Ngọc Lan" --engine mms

Tuỳ chọn
  --list              Liệt kê ebook trong thư mục hàng đợi
  --all               Xử lý mọi ebook trong thư mục hàng đợi
  --input <thư mục>   Thư mục chứa ebook   (mặc định: ./ebooks_queue)
  --output <thư mục>  Thư mục kết quả     (mặc định: ./audiobooks_output)
  --voice <tên>       Giọng đọc            (mặc định: ${DEFAULTS.voice})
  --engine <id>       vieneu | mms | kokoro (mặc định: ${DEFAULTS.engine})
  --format wav|mp3    Định dạng            (mặc định: ${DEFAULTS.format})
  --app <url>         Địa chỉ server       (mặc định: ${DEFAULTS.app})
  --from <câu>        Bắt đầu từ câu thứ N — dùng để nối tiếp sau khi dừng
  --restart           Làm lại kể cả những cuốn đã xong trong lần chạy trước
  --to <câu>          Dừng ở câu thứ N
  --gap <giây>        Im lặng giữa các câu (mặc định: ${DEFAULTS.gap})
  --speed <hệ số>     Đổi tốc độ đọc, giữ nguyên cao độ (mặc định: ${DEFAULTS.speed})
                     > 1 = nhanh hơn, < 1 = chậm hơn. VieNeu/MMS không nhận
                     speed trực tiếp nên tốc độ được áp sau bằng ffmpeg atempo.
                     Kokoro áp trong model, không cần ffmpeg.
  --help              Xem màn trình này

Ví dụ overnight
  node scripts/audiobook.js --all --voice "Ngọc Lan"
  node scripts/audiobook.js --all --engine mms --format mp3
`;

function parseArgs(argv) {
  const opts = { ...DEFAULTS };
  const files = [];
  let list = false;
  let all = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) {
        console.error(`Thiếu giá trị sau ${a}`);
        process.exit(2);
      }
      return argv[++i];
    };
    switch (a) {
      case '--help': case '-h': console.log(HELP); process.exit(0); break;
      case '--list': list = true; break;
      case '--all': all = true; break;
      case '--input': opts.inputDir = next(); break;
      case '--output': opts.outputDir = next(); break;
      case '--voice': opts.voice = next(); break;
      case '--engine': opts.engine = next(); break;
      case '--format': opts.format = next(); break;
      case '--app': opts.app = next(); opts.appExplicit = true; break;
      case '--gap': opts.gap = parseFloat(next()); break;
      case '--speed': opts.speed = parseFloat(next()); break;
      case '--from': opts.from = parseInt(next(), 10); opts.hasFrom = true; break;
      case '--restart': opts.restart = true; break;
      case '--to': opts.to = parseInt(next(), 10); opts.hasTo = true; break;
      default:
        if (a.startsWith('-')) {
          console.error(`Tuỳ chọn không hợp lệ: ${a}`);
          console.error(HELP);
          process.exit(2);
        }
        files.push(a);
    }
  }
  opts.inputDir = path.resolve(opts.inputDir || path.join(ROOT_DIR, 'ebooks_queue'));
  opts.outputDir = path.resolve(opts.outputDir || path.join(ROOT_DIR, 'audiobooks_output'));

  // A NaN here reaches the daemon as max_new_frames=nan, which the model turns
  // into silence rather than an error.
  if (!Number.isFinite(opts.speed) || opts.speed <= 0) {
    console.error(`--speed phải là số lớn hơn 0, nhận được: ${opts.speed}`);
    process.exit(2);
  }
  // parseInt('abc') is NaN, which is falsy, so a guard behind `if (opts.from)`
  // would never run. Checked here where the flag's presence is known.
  for (const [name, value] of [['--from', opts.from], ['--to', opts.to]]) {
    if (value === undefined) continue;
    if (!Number.isInteger(value) || value < 1) {
      console.error(`${name} phải là số nguyên từ 1 trở lên, nhận được: ${value}`);
      process.exit(2);
    }
  }
  if (opts.from !== undefined && opts.to !== undefined && opts.to < opts.from) {
    console.error(`--to (${opts.to}) nhỏ hơn --from (${opts.from})`);
    process.exit(2);
  }
  if (!Number.isFinite(opts.gap) || opts.gap < 0) {
    console.error(`--gap phải là số không âm, nhận được: ${opts.gap}`);
    process.exit(2);
  }
  return { opts, files, list, all };
}

// --------------------------------------------------------------------- server

/** Find a running app; the port is configurable so several can run side by side. */
/**
 * Find a running app. An explicit --app is honoured exactly: silently falling
 * back to another port after a typo means a two-GPU run quietly renders both
 * halves on the same instance.
 */
async function findServer(preferred, explicit) {
  const candidates = explicit
    ? [preferred]
    : [preferred, 'http://127.0.0.1:3222', 'http://127.0.0.1:3111'];
  for (const url of candidates) {
    try {
      const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) return url;
    } catch { /* try the next one */ }
  }
  return null;
}

async function listVoices(app, engine) {
  const res = await fetch(`${app}/api/tts/voices?engine=${encodeURIComponent(engine)}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.voices || [];
}

// ---------------------------------------------------------------------- audio

/** Pull the raw PCM out of a WAV without assuming a 44-byte header. */
function wavToPcm(buf) {
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF') {
    throw new Error('Phản hồi không phải file WAV');
  }
  const fmt = buf.readUInt16LE(20);
  const bits = buf.readUInt16LE(34);
  if (fmt !== 1 || bits !== 16) {
    throw new Error(`Cần WAV 16-bit PCM, nhận được format=${fmt} bits=${bits}`);
  }
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === 'data') return buf.subarray(offset + 8, offset + 8 + size);
    offset += 8 + size + (size & 1);
  }
  throw new Error('WAV không có data chunk');
}

function pcmHeader(dataSize, sampleRate) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + dataSize, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(sampleRate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(dataSize, 40);
  return h;
}

/**
 * Write PCM straight to disk as it arrives.
 *
 * A full book is hundreds of megabytes. Buffering it to concatenate at the end
 * costs that much RAM and, for the biggest books, more than the process is
 * allowed — the run then dies with no output. Appending keeps memory flat.
 */
class PcmWriter {
  constructor(filePath, sampleRate) {
    this.filePath = filePath;
    this.sampleRate = sampleRate;
    this.samples = 0;
    // Start with a header whose sizes are already right for zero samples; they
    // are patched afterwards with fs.write, which can seek. WriteStream.write
    // ignores the offset argument, so patching through it silently no-ops.
    this.fd = fs.openSync(filePath, 'w+');
    fs.writeSync(this.fd, pcmHeader(0, sampleRate));
  }

  append(pcm) {
    fs.writeSync(this.fd, pcm);
    this.samples += pcm.length / 2;
  }

  silence(seconds) {
    const n = Math.round(this.sampleRate * seconds);
    // writeSync would happily write these zeros; allocating in blocks keeps the
    // syscall count down on long books without a big transient buffer.
    const block = Buffer.alloc(Math.min(n, 65536) * 2);
    let written = 0;
    while (written < n * 2) {
      const size = Math.min(block.length, n * 2 - written);
      fs.writeSync(this.fd, block, 0, size);
      written += size;
    }
    this.samples += n;
  }

  /** Rewrite the RIFF and data sizes now that the length is known. */
  close() {
    const dataSize = this.samples * 2;
    const patch = Buffer.alloc(8);
    patch.writeUInt32LE(36 + dataSize, 0);
    patch.writeUInt32LE(dataSize, 4);
    fs.writeSync(this.fd, patch, 0, 4, 4);   // RIFF chunk size at byte 4
    fs.writeSync(this.fd, patch, 4, 4, 40);  // data chunk size at byte 40
    fs.closeSync(this.fd);
    return dataSize;
  }

  abort() {
    try { fs.closeSync(this.fd); } catch { /* already closed */ }
    fs.rmSync(this.filePath, { force: true });
  }
}

/** Encode finished PCM to MP3 via ffmpeg if present; otherwise keep WAV. */
async function toMp3(wavPath, mp3Path, bitrateKbps) {
  const { spawn } = await import('child_process');
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-i', wavPath,
      '-codec:a', 'libmp3lame', '-b:a', `${bitrateKbps}k`, mp3Path]);
    let err = '';
    p.stderr.on('data', d => { err += d; });
    p.on('error', () => reject(new Error('không tìm thấy ffmpeg')));
    p.on('close', code => code === 0
      ? resolve(true)
      : reject(new Error(`ffmpeg exit ${code}: ${err.slice(0, 200)}`)));
  });
}

/**
 * Change tempo in place, keeping pitch, via ffmpeg's atempo.
 *
 * VieNeu and MMS ignore the `speed` argument: their generators stop at an end
 * token, so a frame budget is only a ceiling and never a tempo. atempo is a
 * time-domain stretch, so the voice keeps its pitch -- resampling the file
 * instead would shift every voice by an octave.
 *
 * atempo only accepts 0.5-2.0 per instance, so an out-of-range speed is split
 * into several passes (2.5 becomes atempo=2.0,atempo=1.25).
 */
async function applySpeed(wavPath, speed, engine) {
  // Already applied in the model for Kokoro; doing it again would double it.
  if (engine === 'kokoro') return;
  if (Math.abs(speed - 1) < 0.01) return;

  const factors = [];
  let remaining = speed;
  while (remaining > 2) { factors.push(2); remaining /= 2; }
  while (remaining < 0.5) { factors.push(0.5); remaining /= 0.5; }
  factors.push(remaining);

  const { spawn } = await import('child_process');
  // ffmpeg picks the muxer from the extension, so the temp name has to end in
  // .wav -- not ".wav.speed".
  const tmp = wavPath.replace(/\.wav$/, '') + '.speed.wav';
  return new Promise((resolve, reject) => {
    const args = ['-y', '-loglevel', 'error', '-i', wavPath,
      '-filter:a', factors.map(f => `atempo=${f.toFixed(4)}`).join(','), tmp];
    const p = spawn('ffmpeg', args);
    let err = '';
    p.stderr.on('data', d => { err += d; });
    p.on('error', () => reject(new Error(
      `--speed cần ffmpeg (để đổi tốc độ cho VieNeu/MMS). Cài ffmpeg hoặc bỏ --speed.`)));
    p.on('close', code => {
      if (code !== 0) { fs.rmSync(tmp, { force: true }); return reject(new Error(`ffmpeg exit ${code}: ${err.slice(0, 200)}`)); }
      fs.renameSync(tmp, wavPath);
      resolve(factors);
    });
  });
}

// ----------------------------------------------------------------- main flow

async function synthesize(book, opts) {
  const wanted = opts.format === 'mp3' ? opts.format : 'wav';
  const wavName = `${book.stem}.wav`;
  const wavPath = path.join(opts.outputDir, wavName);
  const partPath = wavPath + '.part';
  fs.mkdirSync(opts.outputDir, { recursive: true });

  // The engines do NOT resample to a common rate: VieNeu returns 48 kHz, MMS
  // 16 kHz, Kokoro 24 kHz. Writing their PCM under one fixed header played
  // VieNeu at half speed and an octave up -- the "echoing robot" voice. The
  // first response decides the rate; a later engine disagreeing is a real
  // error rather than something to paper over, because the samples already
  // written cannot be reinterpreted.
  let writer = null;
  let sampleRate = null;
  let spokenSeconds = 0;
  const t0 = Date.now();

  const total = book.sentences.length;
  try {
    for (let i = 0; i < total; i++) {
      const text = book.sentences[i];
      if (!text.trim()) {
        writer?.silence(opts.gap);
        continue;
      }

      const res = await fetch(`${opts.app}/api/tts/local`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Kokoro takes tempo in the model; VieNeu and MMS ignore the field
        // entirely (they stop at an end token), so their tempo comes from
        // atempo below. Sending it to both would apply it twice.
        body: JSON.stringify({
          text, voice: opts.voice, engine: opts.engine,
          speed: opts.engine === 'kokoro' ? opts.speed : 1,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.wav_base64) {
        throw new Error(`câu ${i + 1}: ${data.error || `HTTP ${res.status}`}`);
      }

      const pcm = wavToPcm(Buffer.from(data.wav_base64, 'base64'));
      if (pcm.length === 0) throw new Error(`câu ${i + 1}: không có âm thanh`);

      const rate = data.sample_rate || opts.sampleRate;
      if (!writer) {
        sampleRate = rate;
        writer = new PcmWriter(partPath, sampleRate);
      } else if (rate !== sampleRate) {
        throw new Error(
          `câu ${i + 1}: engine trả về ${rate}Hz nhưng ${book.stem} đang ghi ${sampleRate}Hz — ` +
          `đổi engine giữa chừng sẽ làm sai tần số phần đã ghi. Chạy từng engine một lượt.`
        );
      }

      writer.append(pcm);
      spokenSeconds += pcm.length / 2 / rate;
      writer.silence(opts.gap);

      const now = Date.now();
      const pct = Math.floor(((i + 1) / total) * 100);
      // Repaint in place; clear leftovers when the line gets shorter.
      const bar = '█'.repeat(Math.round(pct / 2)).padEnd(50, '░');
      const doneMin = (spokenSeconds / 60);
      const speed = now > t0 ? spokenSeconds / ((now - t0) / 1000) : 0;
      const etaMin = speed > 0 && i < total - 1
        ? ((total - i - 1) * 0.55 / speed) / 60 : 0;
      const line = `  ${bar} ${String(pct).padStart(3)}%  ` +
        `${String(i + 1).padStart(4)}/${total} câu  ` +
        `${doneMin.toFixed(1)} phút audio  ` +
        `còn ~${etaMin.toFixed(0)} phút`;
      process.stdout.write('\r' + line.padEnd(92).slice(0, 92));
    }
    process.stdout.write('\r' + ' '.repeat(92) + '\r');
  } catch (err) {
    writer?.abort();
    throw err;
  }

  if (!writer) {
    throw new Error(`${book.stem}: không có câu nào để đọc (${book.title})`);
  }

  writer.close();
  // Rename only after a clean finish, so a partial file never looks done.
  fs.renameSync(partPath, wavPath);

  const usedFactors = await applySpeed(wavPath, opts.speed, opts.engine);
  if (usedFactors) {
    console.log(`  · tốc độ ×${opts.speed} (ffmpeg atempo ${usedFactors.join(',')})`);
  }
  const finalDuration = spokenSeconds / opts.speed;

  if (wanted === 'mp3') {
    const mp3Path = wavPath.replace(/\.wav$/, '.mp3');
    await toMp3(wavPath, mp3Path, opts.bitrate || 96);
    fs.rmSync(wavPath);
    return { path: mp3Path, size: fs.statSync(mp3Path).size, minutes: finalDuration / 60 };
  }
  return { path: wavPath, size: fs.statSync(wavPath).size, minutes: finalDuration / 60 };
}

async function main() {
  const { opts, files, list, all } = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(opts.inputDir) && !files.length) {
    console.error(`Không có thư mục: ${opts.inputDir}`);
    process.exit(1);
  }

  const queued = fs.existsSync(opts.inputDir)
    ? fs.readdirSync(opts.inputDir).filter(f => SUPPORTED.includes(path.extname(f).toLowerCase()))
    : [];

  if (list) {
    if (!queued.length) {
      console.log(`Thư mục rỗng: ${opts.inputDir}`);
    } else {
      console.log(`Trong ${opts.inputDir}:`);
      queued.forEach(f => console.log(`  ${f}`));
    }
    return;
  }

  const targets = all ? queued : files;
  if (!targets.length) {
    console.error(list ? '' : 'Chưa chỉ định sách. Dùng --list, --all, hoặc đường dẫn tới 1 file.');
    if (!list) console.error(HELP);
    process.exit(1);
  }

  const found = await findServer(opts.app, opts.appExplicit);
  if (!found) {
    if (opts.appExplicit) {
      console.error(`Không kết nối được ${opts.app}. Khởi động đúng cổng đó trước, hoặc bỏ --app để tự dò.`);
    } else {
      console.error('Không kết nối được server. Khởi động trước:  ./run.sh 3222');
    }
    process.exit(1);
  }
  if (found !== opts.app) {
    console.warn(`⚠ ${opts.app} không phản hồi, dùng ${found} thay thế.`);
  }
  opts.app = found;
  console.log(`Server: ${opts.app}`);

  // Catch a bad --voice before rendering rather than after the first sentence
  // of the first book. The list only exists once a daemon has booted, so ask
  // the cheapest engine to warm up if it came back empty.
  let voices = await listVoices(opts.app, opts.engine);
  if (!voices.length) {
    await fetch(`${opts.app}/api/tts/local`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'kiểm tra', voice: opts.voice, engine: opts.engine }),
      signal: AbortSignal.timeout(120000),
    }).catch(() => null);
    voices = await listVoices(opts.app, opts.engine);
  }
  if (voices.length && !voices.some(v => (v.name || v.id) === opts.voice)) {
    console.error(`Giọng "${opts.voice}" không tồn tại. Giọng có sẵn:`);
    voices.forEach(v => console.log(`  ${v.name || v.id}`));
    process.exit(2);
  }

  // Checkpoint per book so an overnight run resumes where it stopped instead
  // of re-rendering everything. Keyed by filename+voice, since changing either
  // invalidates the audio.
  const statePath = path.join(opts.outputDir, '.audiobook-progress.json');
  // A truncated file (killed mid-write) must not take down an overnight run;
  // losing the checkpoint only costs a re-render of what is done.
  let state = {};
  if (fs.existsSync(statePath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) state = parsed;
      else console.warn(`⚠ ${statePath} không phải object, bỏ qua checkpoint.`);
    } catch {
      console.warn(`⚠ ${statePath} hỏng, bỏ qua checkpoint (dùng --restart để render lại).`);
    }
  }
  const saveState = () =>
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');

  const ok = [];
  const failed = [];
  for (const [index, entry] of targets.entries()) {
    const isPath = !all;
    const filePath = isPath ? path.resolve(entry) : path.join(opts.inputDir, entry);
    const stem = path.basename(filePath, path.extname(filePath))
      .replace(/[^a-zA-Z0-9_À-ỹ.-]/g, '_');
    // Every option that changes the rendered audio belongs here. Leaving
    // --speed out meant a re-run at a new speed was silently skipped and the
    // old file kept, so the flag looked like it had done nothing.
    const key = [
      path.basename(filePath), opts.voice, opts.engine, opts.format,
      `speed=${opts.speed}`, `gap=${opts.gap}`,
      opts.from || 1, opts.to || 'end',
    ].join('|');
    const doneAt = state[key];
    if (doneAt && !opts.restart) {
      console.log(`\n[${index + 1}/${targets.length}] ${path.basename(filePath)} — ` +
        `đã xong ${new Date(doneAt).toLocaleString('vi-VN')}, bỏ qua (--restart để làm lại)`);
      ok.push(key);
      continue;
    }
    console.log(`\n[${index + 1}/${targets.length}] ${path.basename(filePath)}`);

    try {
      let sentences;
      if (['.txt', '.md'].includes(path.extname(filePath).toLowerCase())) {
        sentences = fs.readFileSync(filePath, 'utf-8')
          .split(/(?<=[.!?…])\s+|(?<=[.!?…])\n/u)
          .map(s => s.trim()).filter(s => s.length > 1);
      } else {
        const res = await fetch(`${opts.app}/api/parse`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: filePath }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        sentences = (data.chapters || []).flatMap(c => c.sentences || []);
      }

      if (opts.from !== undefined || opts.to !== undefined) {
        sentences = sentences.slice((opts.from || 1) - 1, opts.to || undefined);
      }
      if (!sentences.length) throw new Error('không tìm thấy câu nào');

      const result = await synthesize(
        { stem, sentences: sentences.map(stripCues).filter(Boolean) }, opts);
      console.log(`   ✓ ${path.basename(result.path)}` +
        `  ${result.minutes.toFixed(1)} phút  ${(result.size / 1e6).toFixed(1)} MB`);
      state[key] = new Date().toISOString();
      saveState();
      ok.push(result.path);
    } catch (err) {
      console.error(`   ✗ ${err.message}`);
      failed.push(`${path.basename(filePath)} — ${err.message}`);
    }
  }

  console.log('\n' + '='.repeat(70));
  if (failed.length === 0) {
    console.log(`Xong: ${ok.length}/${targets.length} tệp.`);
  } else {
    console.log(`Xong với lỗi: ${ok.length} thành công, ${failed.length} thất bại.`);
    failed.forEach(f => console.log(`  ✗ ${f}`));
  }
  console.log('='.repeat(70));
  process.exitCode = failed.length ? 1 : 0;
}

main().catch(err => {
  console.error('Lỗi:', err.message);
  process.exit(1);
});