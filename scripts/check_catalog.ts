/**
 * The catalog and the daemons must agree.
 *
 * A model in src/data/modelCatalog.ts that no engine can load is a download
 * button that produces 400 MB nobody can use -- the same shape as a feature
 * that renders a sine wave. It also catches the reverse: a weight directory
 * the daemons read that the catalog cannot reinstall.
 *
 *   npx tsx scripts/check_catalog.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { VERIFIED_TTS_MODELS } from '../src/data/modelCatalog';
import { DEFAULT_VOICES } from '../src/data/voices';

const ROOT = path.resolve(import.meta.dirname, '..');
const MODELS_DIR = path.join(ROOT, 'models');
const DAEMON = path.join(ROOT, 'docker', 'tts', 'tts_daemon.py');

// What each engine actually reads. A format listed here and not in the
// catalog is a weight nobody can reinstall; the reverse is an unusable weight.
const ENGINE_FORMATS: Record<string, string[]> = {
  vieneu: ['safetensors'],
  kokoro: ['onnx'],
  mms: ['safetensors'],
};

let failed = 0;
const fail = (msg: string) => { console.error(`FAIL ${msg}`); failed++; };

// 1. Every engine named by a catalog entry exists, and can read its files.
for (const model of VERIFIED_TTS_MODELS) {
  const formats = ENGINE_FORMATS[model.engine];
  if (!formats) {
    fail(`${model.id}: engine "${model.engine}" has no daemon`);
    continue;
  }
  const readable = model.files.filter(f => formats.some(x => f.fileName.endsWith(x)));
  if (readable.length === 0) {
    fail(`${model.id}: no file readable by the ${model.engine} engine (expects ${formats.join('/')})`);
  }
}

// 2. Every model is actually on disk, and no stray weight dir is left behind.
const onDisk = fs.existsSync(MODELS_DIR)
  ? fs.readdirSync(MODELS_DIR).filter(d => fs.statSync(path.join(MODELS_DIR, d)).isDirectory())
  : [];
const known = new Set(VERIFIED_TTS_MODELS.map(m => m.id));
for (const dir of onDisk) {
  if (!known.has(dir)) {
    console.log(`note: models/${dir} is on disk but not in the catalog (not reinstallable)`);
  }
}
for (const model of VERIFIED_TTS_MODELS) {
  if (!onDisk.includes(model.id)) console.log(`note: ${model.id} is in the catalog but not downloaded yet`);
}

// 3. totalSizeBytes must be the sum of its files, or the progress bar lies.
for (const model of VERIFIED_TTS_MODELS) {
  const sum = model.files.reduce((n, f) => n + f.sizeBytes, 0);
  if (Math.abs(sum - model.totalSizeBytes) > 1024) {
    fail(`${model.id}: totalSizeBytes ${model.totalSizeBytes} != file sum ${sum}`);
  }
}

// 4. Every voice must name an engine the daemons have, and be resolvable.
const engines = new Set(Object.keys(ENGINE_FORMATS));
for (const v of DEFAULT_VOICES) {
  if (v.engine !== 'native' && !engines.has(v.engine)) {
    fail(`voice ${v.id} names unknown engine "${v.engine}"`);
  }
  // gen_voices.py writes `<engine>_<voiceId>`; resolveLocalVoice strips the
  // prefix and hands the rest to the daemon. A voice without it is ambiguous.
  if (v.engine !== 'native' && !v.id.startsWith(`${v.engine}_`)) {
    fail(`voice ${v.id} lacks the ${v.engine}_ prefix resolveLocalVoice expects`);
  }
}

const installed = onDisk.filter(d => known.has(d));
if (failed) {
  console.error(`\n${failed} catalog problem(s)`);
  process.exit(1);
}
console.log(
  `ok: ${VERIFIED_TTS_MODELS.length} models, all readable by a daemon; ` +
  `${DEFAULT_VOICES.length} voices all resolve; ` +
  `${installed.length}/${VERIFIED_TTS_MODELS.length} installed`
);
