#!/usr/bin/env node
/**
 * A rendered audiobook must declare the sample rate its PCM was captured at.
 *
 * The engines do not agree: VieNeu 48 kHz, MMS 16 kHz, Kokoro 24 kHz. Writing
 * 48 kHz samples under a 24 kHz header plays every VieNeu book at half speed an
 * octave up -- it sounds like a robot and, because the file is valid RIFF/WAVE,
 * nothing anywhere reports an error.
 *
 *   node scripts/audiobook.js <book> --output /tmp/check-wav-rate
 *   npx tsx scripts/check_wav_rate.ts /tmp/check-wav-rate
 */
import fs from 'node:fs';
import path from 'node:path';

const EXPECTED: Record<string, number> = {
  vieneu: 48000,
  kokoro: 24000,
  mms: 16000,
};

const dir = process.argv[2];
if (!dir) {
  console.error('usage: npx tsx scripts/check_wav_rate.ts <thư mục chứa .wav>');
  process.exit(2);
}

const files = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.wav'));
if (files.length === 0) {
  console.error(`không có .wav nào trong ${dir}`);
  process.exit(1);
}

let failed = 0;
for (const name of files) {
  const buf = fs.readFileSync(path.join(dir, name));
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF') {
    console.error(`FAIL ${name}: không phải RIFF/WAVE`);
    failed++;
    continue;
  }

  let rate = 0;
  let byteRate = 0;
  let channels = 0;
  let bits = 0;
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === 'fmt ') {
      channels = buf.readUInt16LE(offset + 10);
      rate = buf.readUInt32LE(offset + 12);
      byteRate = buf.readUInt32LE(offset + 16);
      bits = buf.readUInt16LE(offset + 22);
    } else if (id === 'data') {
      const seconds = (size / byteRate).toFixed(2);
      const known = Object.entries(EXPECTED).find(([, hz]) => hz === rate);
      const label = known ? known[0] : 'KHÔNG KHỚP ENGINE NÀO';
      console.log(
        `  ${name}: ${rate}Hz ${channels}ch ${bits}bit, ${seconds}s  -> ${label}`
      );
      if (!known) {
        console.error(`FAIL ${name}: ${rate}Hz không phải tần số của engine nào`);
        failed++;
      }
      break;
    }
    offset += 8 + size + (size & 1);
  }
}

if (failed) {
  console.error(`\n${failed} file khai sai tần số lấy mẫu`);
  process.exit(1);
}
console.log(`\nok: ${files.length} file khai đúng tần số`);
