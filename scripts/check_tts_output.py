#!/usr/bin/env python3
"""Fail if /api/tts/local returns something that is not speech.

A render loop that silently produces a sine wave still returns HTTP 200 and a
valid RIFF/WAVE file, so nothing upstream notices. Zero-crossing rate is the
cheapest discriminator: a pure tone sits near 2*f/sr (130 Hz at 48 kHz is
0.005), while voiced speech sits an order of magnitude higher.

  node ../scripts/audiobook.js "book.epub"   # or start ./run.sh first
  python3 scripts/check_tts_output.py
"""
import base64
import json
import math
import struct
import sys
import urllib.request

URL = "http://127.0.0.1:3222/api/tts/local"
TEXT = "Xin chào, đây là kiểm tra tổng hợp giọng đọc."
# Speech sits well above this; a 130 Hz tone at 48 kHz measures 0.005.
MIN_ZCR = 0.02
MIN_RMS = 200.0


def parse_wav(raw: bytes):
    assert raw[:4] == b"RIFF" and raw[8:12] == b"WAVE", "not a RIFF/WAVE payload"
    i, fmt = 12, {}
    while i < len(raw):
        chunk_id = raw[i : i + 4]
        size = struct.unpack("<I", raw[i + 4 : i + 8])[0]
        if chunk_id == b"fmt ":
            f, ch, sr, _, _, bits = struct.unpack("<HHIIHH", raw[i + 8 : i + 24])
            fmt = dict(channels=ch, rate=sr, bits=bits)
        elif chunk_id == b"data":
            return fmt, raw[i + 8 : i + 8 + size]
        i += 8 + size + (size & 1)
    raise AssertionError("no data chunk")


def main() -> int:
    body = json.dumps({"text": TEXT, "voice": "Hải Đăng", "engine": "vieneu"}).encode()
    req = urllib.request.Request(URL, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=180) as res:
        payload = json.load(res)

    if not payload.get("wav_base64"):
        print("FAIL: no wav_base64 in response", file=sys.stderr)
        return 1

    fmt, pcm = parse_wav(base64.b64decode(payload["wav_base64"]))
    if fmt["bits"] != 16:
        print(f"FAIL: expected 16-bit PCM, got {fmt['bits']}-bit", file=sys.stderr)
        return 1

    samples = struct.unpack(f"<{len(pcm) // 2}h", pcm)
    n = len(samples)
    rms = math.sqrt(sum(x * x for x in samples) / n)
    zcr = sum(1 for i in range(1, n) if (samples[i - 1] < 0) != (samples[i] < 0)) / n

    duration = n / fmt["rate"]
    print(
        f"{duration:.2f}s @ {fmt['rate']}Hz  RMS={rms:.0f}  "
        f"zero-cross={zcr:.4f}  peak={max(abs(x) for x in samples)}"
    )

    if zcr < MIN_ZCR:
        print(f"FAIL: zero-cross {zcr:.4f} < {MIN_ZCR} — that is a tone, not speech", file=sys.stderr)
        return 1
    if rms < MIN_RMS:
        print(f"FAIL: RMS {rms:.0f} < {MIN_RMS} — output is effectively silent", file=sys.stderr)
        return 1

    print("OK: broadband speech")
    return 0


if __name__ == "__main__":
    sys.exit(main())
