import { spawn, ChildProcess, execFileSync } from 'child_process';
import { request } from 'http';
import path from 'path';

/**
 * Spawns local TTS daemons on demand and kills them once idle, so a multi-GB
 * model in VRAM is not a permanent tax. One daemon per engine: they load
 * incompatible runtimes and swapping is slower than paying for both.
 *
 * ponytail: one idle timer per engine, not a pool. Add a second if concurrent
 * requests to the same engine ever queue.
 */

export type EngineId = 'vieneu' | 'mms' | 'kokoro';

// Override with TTS_PYTHON when torch/onnxruntime live in another interpreter.
const PYTHON = process.env.TTS_PYTHON || 'python3';
const DAEMON = process.env.TTS_DAEMON
  || path.join(__dirname, '..', 'docker', 'tts', 'tts_daemon.py');
const MODELS = process.env.TTS_MODELS_DIR
  || `${process.cwd()}/models`;
// Ask the GPU rather than trust DEVICE=cuda: a host without a card (or a
// container built with the CPU torch) would otherwise spawn a daemon that
// dies on the first request.
function pickDevice(): string {
  // TTS_DEVICE pins a specific GPU (e.g. "cuda:1") when a second app instance
  // runs beside the first for parallel batch conversion.
  if (process.env.TTS_DEVICE) return process.env.TTS_DEVICE;
  if (process.env.DEVICE === 'cpu') return 'cpu';
  if (process.env.DEVICE === 'cuda') return 'cuda:0';
  if (process.env.DEVICE) return process.env.DEVICE;
  try {
    return execFileSync('nvidia-smi', ['-L'], { stdio: 'pipe' }).toString().trim()
      ? 'cuda:0'
      : 'cpu';
  } catch {
    return 'cpu';
  }
}
const DEVICE = pickDevice();
// Booting a daemon costs ~4s, which the user hears as a stall on the next
// sentence. Readers pause for minutes, so the default holds the model much
// longer than before; lower it to reclaim VRAM sooner. 930 MiB per GPU.
const IDLE_TIMEOUT_MS = parseInt(process.env.TTS_IDLE_TIMEOUT_MS || '1200000', 10);

interface EngineSpec {
  id: EngineId;
  port: number;
  modelDir: string;
  device?: string;
  dtype?: string;
}

function specFor(id: EngineId): EngineSpec {
  switch (id) {
    case 'vieneu':
      return {
        // A second app instance needs its own daemon ports.
        id, port: 9980 + (parseInt(process.env.TTS_PORT_OFFSET || '0', 10)),
        modelDir: `${MODELS}/vieneu-tts-v3-turbo`,
        device: DEVICE,
        // float32 on CPU: float16 is not implemented there and throws.
        // bfloat16 on GPU, matching what the official SDK selects there.
        dtype: DEVICE === 'cpu' ? 'float32' : 'bfloat16',
      };
    case 'mms':
      return { id, port: 9981 + (parseInt(process.env.TTS_PORT_OFFSET || '0', 10)), modelDir: `${MODELS}/mms-tts-vie` };
    case 'kokoro':
      return { id, port: 9982 + (parseInt(process.env.TTS_PORT_OFFSET || '0', 10)), modelDir: `${MODELS}/kokoro-vietnamese` };
  }
}

const running = new Map<EngineId, { proc: ChildProcess; timer: NodeJS.Timeout; pid: number }>();
const starting = new Map<EngineId, Promise<void>>();

// A daemon we did not spawn (manual start, or a previous app run) has no
// owner pid, so we adopt it but never stop it. ponytail: one owner per
// daemon; add a lockfile only if two app instances ever race on the same port.
const ORPHAN = 0;

function isUp(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const req = request({ host: '127.0.0.1', port, path: '/health', timeout: 800 }, res => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

async function waitForHealth(port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isUp(port)) return true;
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

export async function ensureEngine(id: EngineId): Promise<{ ok: boolean; error?: string }> {
  const spec = specFor(id);

  // Someone else (or a previous run) already started it — adopt it.
  if (await isUp(spec.port)) {
    touch(id);
    return { ok: true };
  }

  const inFlight = starting.get(id);
  if (inFlight) {
    await inFlight;
    return { ok: await isUp(spec.port) };
  }

  const boot = (async () => {
    const args = [
      DAEMON, '--engine', id,
      '--port', String(spec.port),
      '--model-dir', spec.modelDir,
    ];
    if (spec.device) args.push('--device', spec.device);
    if (spec.dtype) args.push('--dtype', spec.dtype);

    const proc = spawn(PYTHON, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const log = (buf: Buffer) => {
      const line = buf.toString().trim();
      if (line) console.log(`[tts:${id}] ${line}`);
    };
    proc.stdout?.on('data', log);
    proc.stderr?.on('data', log);
    proc.on('exit', code => {
      console.log(`[tts:${id}] exited with code ${code}`);
      const entry = running.get(id);
      if (entry && entry.proc === proc) {
        clearTimeout(entry.timer);
        running.delete(id);
      }
    });

    // Model load is 2-30 s depending on engine and device.
    const healthy = await waitForHealth(spec.port, 120000);
    if (!healthy) {
      proc.kill('SIGTERM');
      throw new Error(`daemon ${id} did not become healthy on port ${spec.port}`);
    }
    running.set(id, { proc, pid: proc.pid ?? ORPHAN, timer: setTimeout(() => stopEngine(id), IDLE_TIMEOUT_MS) });
  })();

  starting.set(id, boot.then(() => undefined).catch(() => undefined));
  try {
    await boot;
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  } finally {
    starting.delete(id);
  }
}

function touch(id: EngineId) {
  const entry = running.get(id);
  if (entry) {
    clearTimeout(entry.timer);
    entry.timer = setTimeout(() => stopEngine(id), IDLE_TIMEOUT_MS);
  }
}

export function stopEngine(id: EngineId) {
  const entry = running.get(id);
  if (!entry) return;
  clearTimeout(entry.timer);
  running.delete(id);
  if (entry.pid === ORPHAN) {
    // Adopted, not ours — leave it alone so another app instance keeps working.
    console.log(`[tts:${id}] stopped tracking (daemon was already running)`);
    return;
  }
  entry.proc.kill('SIGTERM');
  console.log(`[tts:${id}] idle timeout -> stopped`);
}

export function stopAllEngines() {
  for (const id of [...running.keys()]) stopEngine(id);
}

export function isEngineRunning(id: EngineId): boolean {
  return running.has(id);
}

/** POST a synthesis request to a daemon, resolving to its JSON reply. */
export async function callDaemon<T = any>(
  id: EngineId,
  path: string,
  payload?: unknown,
  timeoutMs = 120000
): Promise<{ status: number; body: T }> {
  const spec = specFor(id);
  const data = payload === undefined ? undefined : JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port: spec.port,
        path,
        method: data ? 'POST' : 'GET',
        timeout: timeoutMs,
        headers: data
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
          : undefined,
      },
      res => {
        let body = '';
        res.setEncoding('utf-8');
        res.on('data', c => (body += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode || 500, body: JSON.parse(body) });
          } catch {
            resolve({ status: res.statusCode || 500, body: { error: body.slice(0, 500) } as any });
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error(`daemon ${id} timeout`)); });
    if (data) req.write(data);
    req.end();
  });
}
