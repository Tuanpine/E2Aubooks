import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { Library } from './server/library';
import { createServer as createViteServer } from 'vite';
import {
  getModelCatalogWithDiskStatus,
  startModelDownload,
  cancelModelDownload,
  deleteModelFiles,
  getModelProgress,
  verifyRemoteUrl,
} from './server/modelDownloader.js';
import { VERIFIED_TTS_MODELS } from './src/data/modelCatalog.js';
import {
  ensureEngine, callDaemon, isEngineRunning, stopEngine, stopAllEngines,
  type EngineId,
} from './server/ttsSupervisor.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

const ENGINES: EngineId[] = ['vieneu', 'mms', 'kokoro'];
const MAX_TTS_CHARS = parseInt(process.env.TTS_MAX_CHARS || '1200', 10);

// Kept in sync with SUPPORTED_EMOTIONS in src/utils/emotionTagger.ts.
const EMOTION_TAG_RE =
  /\[cười\]|\[thở dài\]|\[ngạc nhiên\]|\[thì thầm\]|\[tức giận\]|\[buồn bã\]|\[hồi hộp\]|\[nghẹn ngào\]/gi;

function isEngineId(v: unknown): v is EngineId {
  return typeof v === 'string' && (ENGINES as string[]).includes(v);
}

app.use(express.json({ limit: '50mb' }));
// Raw body for audio upload: a long export can be hundreds of megabytes, and
// base64-encoding it would triple both the payload and the tab's memory.
app.use('/api/library/audio', express.raw({ type: 'application/octet-stream', limit: '4gb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

/**
 * The UI shows hardware info, but WebGL would report the *viewer's* GPU.
 * Ask nvidia-smi / the CPU count for the machine that actually runs the models.
 */
/** ffmpeg is not on PATH here; Hermes ships one under ~/.hermes/tools. */
function findFfmpeg(): string | null {
  const explicit = process.env.FFMPEG_BIN;
  if (explicit && fs.existsSync(explicit)) return explicit;
  const toolsDir = path.join(os.homedir(), '.hermes', 'tools');
  try {
    for (const name of fs.readdirSync(toolsDir)) {
      const candidate = path.join(toolsDir, name, 'bin', 'ffmpeg');
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch { /* no tools dir */ }
  for (const p of ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg']) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function detectHardware() {
  const cpus = os.cpus();
  let gpus: string[] = [];
  try {
    gpus = execFileSync('nvidia-smi', ['--query-gpu=name', '--format=csv,noheader'], {
      stdio: 'pipe', timeout: 3000,
    }).toString().split('\n').map(s => s.trim()).filter(Boolean);
  } catch {
    gpus = []; // no NVIDIA card, or no toolkit inside a container
  }
  return {
    cpuCores: cpus.length,
    gpuCount: gpus.length,
    isNvidiaGpu: gpus.length > 0,
    nvidiaModel: gpus[0],
    gpuRenderer: gpus.length ? gpus.join(' + ') : 'CPU only',
    gpuVendor: gpus.length ? 'NVIDIA' : 'Generic',
  };
}

// ---- library: uploaded ebooks and rendered audio ----
const library = new Library(process.env.LIBRARY_DIR || path.join(__dirname, 'data'));

/**
 * Node has no DOMParser. linkedom supplies one with querySelector, which the
 * parser uses to walk container.xml and the OPF package. Every endpoint that
 * parses an ebook must call this first.
 */
async function ensureDomParser(): Promise<void> {
  if (typeof (globalThis as any).DOMParser !== 'undefined') return;
  const { DOMParser } = await import('linkedom');
  (globalThis as any).DOMParser = DOMParser;
}

/**
 * Parse an ebook the way the browser does, and refuse an empty result.
 *
 * Both routes below used to duplicate this dispatch, and neither checked the
 * outcome: a scanned PDF parsed to zero chapters, was stored anyway, and the
 * reader only found out when chapters[0] came back undefined and the page went
 * white. A scanned PDF has no text layer for pdf.js to read, so this is an
 * expected input, not a corrupt file.
 */
async function parseUploaded(ext: string, fileName: string, buffer: ArrayBuffer, text: string) {
  const P = await import('./src/utils/ebookParser');
  let parsed;
  if (ext === 'txt' || ext === 'md') {
    parsed = await P.parseTxt(text, fileName, ext === 'md' ? 'md' : 'txt');
  } else if (ext === 'epub') {
    parsed = await P.parseEpub(buffer, fileName);
  } else if (['mobi', 'azw', 'azw3'].includes(ext)) {
    parsed = await P.parseMobi(buffer, fileName);
  } else if (ext === 'pdf') {
    parsed = await P.parsePdf(buffer, fileName);
  } else if (ext === 'docx') {
    parsed = await P.parseDocx(buffer, fileName);
  } else {
    throw Object.assign(new Error(`không hỗ trợ định dạng .${ext}`), { status: 400 });
  }
  if (!parsed.chapters || parsed.chapters.length === 0) {
    throw Object.assign(
      new Error(
        `${fileName}: không đọc được nội dung (0 chương). PDF scan không có lớp chữ — ` +
        `cần OCR trước, hoặc chuyển sang EPUB/TXT.`
      ),
      { status: 422 }
    );
  }
  return parsed;
}

app.get('/api/library/books', (_req, res) => res.json({ books: library.listBooks() }));

app.get('/api/library/books/:id', (req, res) => {
  const book = library.getBook(parseInt(req.params.id, 10));
  if (!book) return res.status(404).json({ error: 'book not found' });
  return res.json({ book });
});

app.post('/api/library/books', async (req, res) => {
  const { file_name: fileName, data_base64: dataB64 } = req.body || {};
  if (!fileName || !dataB64) {
    return res.status(400).json({ error: 'file_name and data_base64 are required' });
  }
  try {
    const bytes = Buffer.from(dataB64, 'base64');
    const buffer = new Uint8Array(bytes).buffer;
    const ext = String(fileName).split('.').pop()!.toLowerCase();
    await ensureDomParser();
    const parsed = await parseUploaded(ext, fileName, buffer, bytes.toString('utf-8'));
    const book = library.saveBook(fileName, bytes, {
      metadata: parsed.metadata,
      chapters: parsed.chapters,
    });
    return res.json({ book });
  } catch (err: any) {
    if (err?.status) return res.status(err.status).json({ error: err.message });
    console.error('[library] upload failed', err);
    return res.status(500).json({ error: err?.message || String(err) });
  }
});

app.delete('/api/library/books/:id', (req, res) => {
  const ok = library.deleteBook(parseInt(req.params.id, 10));
  return res.status(ok ? 200 : 404).json({ deleted: ok });
});

app.get('/api/library/audio', (_req, res) => res.json({ audio: library.listAudio() }));

app.post('/api/library/audio', (req, res) => {
  const bytes = Buffer.isBuffer(req.body) ? req.body : undefined;
  const name = typeof req.query.name === 'string' ? req.query.name : '';
  if (!bytes || bytes.length === 0 || !name) {
    return res.status(400).json({ error: 'binary body and ?name= are required' });
  }
  if (bytes.length > 4 * 1024 * 1024 * 1024) {
    return res.status(413).json({ error: 'file exceeds 4 GB' });
  }
  const ext = name.split('.').pop() || 'wav';
  const rate = 24000;
  const record = library.saveAudio(name, bytes, {
    bookTitle: name.replace(/\.[^.]+$/, ''),
    voiceId: String(req.query.voice ?? ''),
    engine: String(req.query.engine ?? ''),
    format: ext,
    durationSec: Math.max(0, (bytes.length - 44) / (2 * rate)),
  });
  console.log(`[library] audio saved ${record.fileName} ${(bytes.length / 1e6).toFixed(1)} MB`);
  return res.json({ record });
});

app.get('/api/library/audio/:id/download', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const list = library.listAudio(1000);
  const record = list.find((a) => a.id === id);
  if (!record) return res.status(404).json({ error: 'audio not found' });
  res.download(library.audioPath(record.fileName), record.fileName);
});

app.delete('/api/library/audio/:id', (req, res) => {
  const ok = library.deleteAudio(parseInt(req.params.id, 10));
  return res.status(ok ? 200 : 404).json({ deleted: ok });
});

// Health & Model Status
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    hardware: detectHardware(),
    engines: [
      { id: 'vieneu-tts', name: 'VieNeu-TTS v3 Turbo (48kHz, 10 giọng)', engine: 'vieneu', type: 'neural', running: isEngineRunning('vieneu') },
      { id: 'kokoro-82m', name: 'Kokoro-82M ONNX (24kHz)', engine: 'kokoro', type: 'neural', running: isEngineRunning('kokoro') },
      { id: 'mms-tts-vie', name: 'Meta MMS Vietnamese (16kHz)', engine: 'mms', type: 'neural', running: isEngineRunning('mms') },
      { id: 'native-tts', name: 'Edge & System WebSpeech', engine: 'native', type: 'native' },
    ],
  });
});

// Start a daemon without synthesizing (lets the UI warm one up).
app.post('/api/tts/start', async (req, res) => {
  const { engine } = req.body;
  if (!isEngineId(engine)) return res.status(400).json({ error: `engine must be one of ${ENGINES.join(', ')}` });
  const result = await ensureEngine(engine);
  return res.status(result.ok ? 200 : 500).json(result);
});

app.post('/api/tts/stop', (req, res) => {
  const { engine } = req.body;
  if (!isEngineId(engine)) return res.status(400).json({ error: `engine must be one of ${ENGINES.join(', ')}` });
  stopEngine(engine);
  return res.json({ success: true, engine });
});

/**
 * Parse an ebook from disk and return its chapters as plain text. Used by
 * scripts/audiobook.js, which has no browser to run the parser in.
 */
app.post('/api/parse', async (req, res) => {
  const { path: filePath } = req.body;
  if (!filePath || typeof filePath !== 'string') {
    return res.status(400).json({ error: 'path is required' });
  }
  // Only read inside the project — this endpoint takes a path from the client.
  const root = __dirname;
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(root + path.sep)) {
    return res.status(403).json({ error: 'path must be inside the project directory' });
  }
  if (!fs.existsSync(resolved)) {
    return res.status(404).json({ error: `not found: ${resolved}` });
  }
  try {
    await ensureDomParser();
    const ext = resolved.split('.').pop()!.toLowerCase();
    const fileName = resolved.split(path.sep).pop()!;
    const bytes = fs.readFileSync(resolved);
    const buffer = new Uint8Array(bytes).buffer;
    const parsed = await parseUploaded(ext, fileName, buffer, bytes.toString('utf-8'));

    return res.json({
      metadata: parsed.metadata,
      chapters: parsed.chapters.map(c => ({ title: c.title, sentences: c.sentences })),
    });
  } catch (err: any) {
    if (err?.status) return res.status(err.status).json({ error: err.message });
    console.error('[parse]', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/** WAV -> MP3 for the export dialog. Returns 501 when ffmpeg is missing. */
app.post('/api/tts/encode-mp3', async (req, res) => {
  const { wav_base64: wavB64, bitrate } = req.body || {};
  if (!wavB64 || typeof wavB64 !== 'string') {
    return res.status(400).json({ error: 'wav_base64 is required' });
  }
  try {
    const wav = Buffer.from(wavB64, 'base64');
    if (wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF') {
      return res.status(400).json({ error: 'not a RIFF/WAVE payload' });
    }
    const ffmpeg = findFfmpeg();
    if (!ffmpeg) return res.status(501).json({ error: 'ffmpeg not available' });
    const rate = Math.max(32, Math.min(320, parseInt(bitrate, 10) || 96));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'e2a-mp3-'));
    const src = path.join(tmp, 'in.wav');
    const dst = path.join(tmp, 'out.mp3');
    try {
      fs.writeFileSync(src, wav);
      execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', src,
        '-codec:a', 'libmp3lame', '-b:a', `${rate}k`, dst], { timeout: 120000 });
      const mp3 = fs.readFileSync(dst);
      return res.json({ mp3_base64: mp3.toString('base64'), mimeType: 'audio/mpeg', bytes: mp3.length });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'encode failed' });
  }
});

// Synthesize with a local engine, booting its daemon on first use.
app.post('/api/tts/local', async (req, res) => {
  const { text, voice, engine = 'vieneu', speed } = req.body;
  if (!isEngineId(engine)) return res.status(400).json({ error: `engine must be one of ${ENGINES.join(', ')}` });
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }
  // VieNeu prefills the whole prompt onto the GPU, so a long paragraph OOMs a
  // 12 GB card (400 sentences tried to allocate 16.6 GiB). Callers already
  // speak one sentence at a time; this guards batch/export paths.
  if (text.length > MAX_TTS_CHARS) {
    return res.status(413).json({
      error: `Đoạn văn dài ${text.length} ký tự (tối đa ${MAX_TTS_CHARS}). Hãy chia nhỏ thành câu trước khi đọc.`,
    });
  }
  // Strip emotion cues here too. The model reads "[cười]" aloud with a
  // different delivery, so a tagged sentence sounds like a different
  // narrator. Client-side stripping alone is not enough: the batch CLI and
  // any future caller hit this endpoint directly.
  const cleanText = text.replace(EMOTION_TAG_RE, '').replace(/\s{2,}/g, ' ').trim();
  if (!cleanText) return res.status(400).json({ error: 'text is empty after removing emotion tags' });

  try {
    const boot = await ensureEngine(engine);
    if (!boot.ok) {
      return res.status(503).json({ error: `Không khởi động được daemon ${engine}: ${boot.error}` });
    }
    const format = req.body.format === 'mp3' ? 'mp3' : 'wav';
    const { status, body } = await callDaemon(engine, '/synthesize', {
      text: cleanText, voice, speed, format,
    });
    if (status !== 200) return res.status(status).json(body);
    // The daemon falls back to WAV when ffmpeg is missing, so trust its own
    // mimeType rather than the requested format.
    return res.json({ success: true, ...body, mimeType: body.mimeType || 'audio/wav' });
  } catch (err: any) {
    return res.status(503).json({ error: `Lỗi daemon ${engine}: ${err?.message}` });
  }
});

// Voices the selected engine actually has.
app.get('/api/tts/voices', async (req, res) => {
  const engine = req.query.engine;
  if (!isEngineId(engine)) return res.status(400).json({ error: `engine must be one of ${ENGINES.join(', ')}` });
  try {
    const boot = await ensureEngine(engine);
    if (!boot.ok) return res.status(503).json({ error: boot.error });
    const { status, body } = await callDaemon(engine, '/voices');
    return res.status(status).json(body);
  } catch (err: any) {
    return res.status(503).json({ error: err?.message || 'daemon unreachable' });
  }
});

// TTS Model Download Manager APIs
app.get('/api/models', (req, res) => {
  try {
    const models = getModelCatalogWithDiskStatus();
    res.json({ success: true, models });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/models/download', async (req, res) => {
  try {
    const { modelId } = req.body;
    if (!modelId) {
      return res.status(400).json({ error: 'modelId is required' });
    }
    await startModelDownload(modelId);
    res.json({ success: true, message: `Bắt đầu tải mô hình ${modelId}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/models/progress/:modelId', (req, res) => {
  try {
    const { modelId } = req.params;
    const progress = getModelProgress(modelId);
    res.json(progress);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/models/cancel/:modelId', (req, res) => {
  try {
    const { modelId } = req.params;
    const cancelled = cancelModelDownload(modelId);
    res.json({ success: cancelled });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/models/:modelId', (req, res) => {
  try {
    const { modelId } = req.params;
    const deleted = deleteModelFiles(modelId);
    res.json({ success: deleted });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/models/verify/:modelId', async (req, res) => {
  try {
    const { modelId } = req.params;
    const model = VERIFIED_TTS_MODELS.find(m => m.id === modelId);
    if (!model) {
      return res.status(404).json({ error: `Model ${modelId} not found` });
    }

    const verificationResults = await Promise.all(
      model.files.map(async (file) => {
        const check = await verifyRemoteUrl(file.url);
        return {
          fileName: file.fileName,
          url: file.url,
          expectedBytes: file.sizeBytes,
          actualRemoteBytes: check.contentLength,
          statusCode: check.status,
          isAccessible: check.ok,
        };
      })
    );

    const allAccessible = verificationResults.every(r => r.isAccessible);

    res.json({
      success: true,
      modelId,
      allAccessible,
      files: verificationResults,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

async function startServer() {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`E2Aubooks server running on port ${PORT}`);
  });

  // Daemons hold GPU/CPU memory; do not leak them when the app exits.
  const shutdown = () => { stopAllEngines(); server.close(); process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

startServer();