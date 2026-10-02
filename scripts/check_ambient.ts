/**
 * Every ambient bed must produce audible, finite, non-clipped samples.
 *
 * The beds are noise generators with filter state; a coefficient typo shows up
 * as silence, NaN, or a full-scale square, and none of those throw. Run with
 * `npx tsx scripts/check_ambient.ts`.
 */
import {
  createAmbientSampler,
  AMBIENT_TRACKS,
  type AmbientSoundType,
} from '../src/utils/ambientSoundscapes';

const SR = 24000;
const BEDS: AmbientSoundType[] = AMBIENT_TRACKS.map(t => t.id).filter(t => t !== 'none');

// Below this a bed is inaudible under narration; above ~0.9 it clips the mix.
const MIN_RMS = 0.002;
const MAX_PEAK = 0.95;
const SECONDS = 4;

let failed = 0;
for (const kind of BEDS) {
  const sampleAt = createAmbientSampler(kind);
  const n = SR * SECONDS;
  let sum = 0;
  let peak = 0;
  let nonFinite = 0;

  for (let i = 0; i < n; i++) {
    const v = sampleAt(i, SR);
    if (!Number.isFinite(v)) { nonFinite++; continue; }
    sum += v * v;
    if (Math.abs(v) > peak) peak = Math.abs(v);
  }

  const rms = Math.sqrt(sum / n);
  const problems: string[] = [];
  if (nonFinite) problems.push(`${nonFinite} non-finite samples`);
  if (rms < MIN_RMS) problems.push(`RMS ${rms.toFixed(5)} < ${MIN_RMS} (inaudible)`);
  if (peak > MAX_PEAK) problems.push(`peak ${peak.toFixed(3)} > ${MAX_PEAK} (clips)`);
  if (peak === 0) problems.push('peak 0 (silent)');

  const status = problems.length ? 'FAIL' : 'ok  ';
  console.log(`${status} ${kind.padEnd(10)} RMS=${rms.toFixed(5)} peak=${peak.toFixed(3)} ${problems.join('; ')}`);
  if (problems.length) failed++;
}

if (failed) {
  console.error(`\n${failed}/${BEDS.length} ambient beds are broken`);
  process.exit(1);
}
console.log(`\nall ${BEDS.length} ambient beds audible and in range`);
