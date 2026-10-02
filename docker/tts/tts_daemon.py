#!/usr/bin/env python3
"""
Unified local TTS daemon for E2Aubooks.

    python tts_daemon.py --engine vieneu --port 9980
    python tts_daemon.py --engine mms    --port 9981
    python tts_daemon.py --engine kokoro --port 9982

All engines expose the same HTTP contract, so the app can hot-swap between them:

    GET  /health     -> {"ok": bool, "engine": str, "device": str}
    GET  /voices     -> {"voices": [{"name","id","gender","description"}]}
    POST /synthesize {"text", "voice", "speed"} -> {"wav_base64","sample_rate","duration_sec"}

The app spawns these lazily and kills them after an idle timeout, so a
30 GB model sitting in VRAM is not a permanent tax on the machine.
"""
import argparse
import base64
import io
import json
import logging
import os
import sys
import threading
import unicodedata
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Optional

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(levelname)s: %(message)s")
logger = logging.getLogger("TTSDaemon")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def norm(name: str) -> str:
    """Canonical voice key: no diacritics, lowercase, no separators.

    The browser sends ids built from the slugified display name
    (`hải_đăng`), the manifests use the display name (`Hải Đăng`), and Kokoro
    uses a snake_case key (`diem_trinh`). All three have to land on the same
    key or a lookup silently misses.
    """
    stripped = "".join(
        c for c in unicodedata.normalize("NFD", name) if unicodedata.category(c) != "Mn"
    ).lower()
    return "".join(c for c in stripped if c.isalnum())


def encode_mp3(wav: bytes, bitrate: Optional[int] = None) -> tuple:
    """WAV -> MP3 via ffmpeg. Returns (base64, mime) or (None, "") if absent.

    ffmpeg is not a Python dependency, so this shells out; MP3 is opt-in
    (export only) and a missing ffmpeg degrades to WAV rather than failing.
    """
    import shutil
    import subprocess
    import tempfile

    ffmpeg = shutil.which("ffmpeg") or os.environ.get("FFMPEG_BIN")
    if not ffmpeg:
        for guess in (
            os.path.expanduser("~/.hermes/tools"),
            "/usr/local/bin", "/usr/bin",
        ):
            if os.path.isdir(guess):
                for name in os.listdir(guess):
                    cand = os.path.join(guess, name, "bin", "ffmpeg")
                    if os.path.isfile(cand):
                        ffmpeg = cand
                        break
            if ffmpeg:
                break
    if not ffmpeg or not os.path.isfile(ffmpeg):
        return None, ""

    rate = int(bitrate or 96)
    rate = max(32, min(320, rate))
    try:
        with tempfile.TemporaryDirectory() as tmp:
            src = os.path.join(tmp, "in.wav")
            dst = os.path.join(tmp, "out.mp3")
            with open(src, "wb") as f:
                f.write(wav)
            subprocess.run(
                [ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
                 "-i", src, "-codec:a", "libmp3lame", "-b:a", f"{rate}k", dst],
                check=True, timeout=120,
            )
            with open(dst, "rb") as f:
                return base64.b64encode(f.read()).decode("ascii"), "audio/mpeg"
    except Exception as e:  # noqa: BLE001
        logger.warning("MP3 encoding failed, serving WAV: %s", e)
        return None, ""


def wav_bytes(waveform, sample_rate: int) -> bytes:
    """Serialize a waveform to WAV.

    Two guards, because engines disagree wildly on level: VieNeu overshoots
    past 1.0 (audible clipping) and Kokoro sits near 0.02 (needlessly quiet).
    Clamp first, then normalize only if the result is still too quiet — that
    leaves well-behaved engines untouched.
    """
    import numpy as np
    import scipy.io.wavfile as wf

    audio = np.asarray(waveform, dtype=np.float32).ravel()
    audio = np.nan_to_num(audio, nan=0.0, posinf=0.0, neginf=0.0)
    audio = np.clip(audio, -1.0, 1.0)

    peak = float(np.max(np.abs(audio))) if audio.size else 0.0
    if 0 < peak < 0.5:
        audio = audio * (0.95 / peak)

    # Int16 PCM, not float32: every client strips a 44-byte header and writes
    # an int16 header, so a float32 payload is decoded as garbage noise there.
    pcm = np.clip(audio * 32767.0, -32768, 32767).astype("<i2")
    buf = io.BytesIO()
    wf.write(buf, sample_rate, pcm)
    return buf.getvalue()


class Engine:
    """Base: subclasses load a model and turn text into a waveform."""

    name = "base"
    default_device = "cpu"
    default_dtype = "float32"
    max_chars = 1200  # matches TTS_MAX_CHARS in server.ts

    def __init__(self, model_dir: str, device: str, dtype: str):
        self.model_dir = model_dir
        self.device = device
        self.dtype = dtype
        self._lock = threading.Lock()  # one generation at a time; per-GPU queue if throughput matters
        self._ready = False

    def load(self) -> None:
        raise NotImplementedError

    def voices(self) -> list:
        return []

    def synth(self, text: str, voice: Optional[str], speed: float) -> tuple[bytes, int, float]:
        raise NotImplementedError


class VieNeuEngine(Engine):
    """VieNeu-TTS v3 Turbo (PyTorch safetensors). 48 kHz, 10 Vietnamese voices."""

    name = "vieneu"
    default_device = "cuda"
    default_dtype = "bfloat16"
    # Hard ceiling on generated length, ~72 s at 12.5 frames/s. The SDK's own
    # default is 300; this only exists so a runaway generation cannot fill RAM.
    MAX_FRAMES = 900

    def load(self):
        # VIENEU_SRC lets the Docker image mount the engine source elsewhere;
        # on the host it stays beside this file.
        # Prefer the installed SDK: it ships the current voices_v3_turbo.json
        # (25 presets). VIENEU_SRC is for Docker, where the source is copied in.
        vieneu_src = os.environ.get("VIENEU_SRC")
        if vieneu_src:
            sys.path.insert(0, vieneu_src)
        else:
            import vieneu as _sdk
            vieneu_src = os.path.dirname(_sdk.__file__)
        # The MOSS codec is fetched from the Hub on first boot and cached under
        # ~/.cache/huggingface. Once cached, going offline skips six HEAD
        # requests per start; set HF_HUB_OFFLINE=0 to force a refresh.
        if os.environ.get("HF_HUB_OFFLINE") is None and os.path.isdir(
            os.path.expanduser("~/.cache/huggingface/hub")
        ):
            os.environ["HF_HUB_OFFLINE"] = "1"
        from vieneu._v3_turbo_engine import VieNeuTTSv3Turbo

        # vieneu_src is already the package directory in both cases: the SDK
        # path comes from vieneu.__file__, VIENEU_SRC points at it for Docker.
        presets_path = os.path.join(vieneu_src, "assets", "voices_v3_turbo.json")
        with open(presets_path, encoding="utf-8") as f:
            data = json.load(f)
        self._presets = {norm(k): dict(v, name=k) for k, v in data["presets"].items()}
        self._default = data["default_voice"]
        # Our model_dir has the weights at the root; SDK 3.8 defaults to a
        # 'update/' subfolder, which makes it look for a config that isn't there.
        self._model = VieNeuTTSv3Turbo(checkpoint_path=self.model_dir, model_subfolder='',
                                       device=self.device, dtype=self.dtype)
        self._ready = True

    def voices(self) -> list:
        # SDK 3.8 dropped reserved_id for speaker_emb; order by the editors'
        # featured rank so the UI lists them the way the model card does.
        return [
            {"name": p["name"], "id": i,
             "gender": p.get("gender", ""), "region": p.get("region", ""),
             "style": p.get("style", ""), "description": p.get("description", "")}
            for i, (_, p) in enumerate(sorted(
                self._presets.items(), key=lambda kv: (kv[1].get("featured", 99), kv[1]["name"])))
        ]

    def _preset(self, name: Optional[str]) -> dict:
        key = norm(name) if name else norm(self._default)
        if key not in self._presets:
            raise ValueError(f"Voice '{name}' not found. Available: {[v['name'] for v in self.voices()]}")
        return self._presets[key]

    def _speaker_emb(self, name: Optional[str]):
        # Each preset ships the speaker's own embedding. Passing it gives the
        # model a concrete voice to imitate; without it every sentence drifts
        # to a different narrator.
        import numpy as np
        emb = self._preset(name).get("speaker_emb")
        if not emb:
            return None
        arr = np.asarray(emb, dtype=np.float32)
        return arr.reshape(1, -1) if arr.ndim > 1 else arr

    def _ref_codes(self, name: Optional[str]):
        import numpy as np
        codes = self._preset(name).get("codes")
        if not codes:
            return None
        return np.asarray(codes, dtype=np.int64)

    def synth(self, text, voice, speed):
        # Phonemise here and pass `phonemes=`, the way the SDK's own path does.
        # Going through `text=` looks equivalent but is not: the SDK normalises
        # punctuation and sizes the frame budget from the phoneme string, and
        # skipping that produced audio whose prosody drifted off Vietnamese.
        from vieneu_utils.phonemize_text import phonemize_text_with_emotions
        phonemes = phonemize_text_with_emotions(text)
        # 1 frame = 80 ms, so 12.5 frames per second of audio.
        #
        # Two separate jobs, one formula each:
        #   - a floor, so a short line is not cut off mid-word;
        #   - a ceiling, so a stray "…" the splitter left behind cannot make the
        #     model run the whole budget and emit 72 s of near-silence.
        # The ceiling is 12 s of audio per phoneme plus a floor. It is NOT
        # divided by speed: speed here is a length multiplier, and dividing the
        # ceiling by it made `min()` collapse to the floor for most sentences,
        # so speed stopped mattering at all. Scaling the frame budget changes
        # how long the model may generate, which is a ceiling, not a tempo --
        # for an actual tempo change resample the finished WAV.
        MIN_FRAMES, FRAMES_PER_SECOND = 40, 12.5
        floor = MIN_FRAMES
        ceiling = int((2.0 + len(phonemes) / 2.5) * FRAMES_PER_SECOND)
        frames = max(floor, min(ceiling, int(MAX_FRAMES * speed)))
        with self._lock:
            wav = self._model.infer(
                phonemes=phonemes,
                ref_codes=self._ref_codes(voice),
                speaker_emb=self._speaker_emb(voice),
                # The default 0.8 samples a different delivery every call, which
                # reads as a new narrator per sentence. Deterministic output
                # keeps one voice across the whole book.
                temperature=0.3,
                top_k=15,
                repetition_penalty=1.2,
                max_new_frames=frames,
            )
        sr = int(self._model.SAMPLE_RATE)
        return wav_bytes(wav, sr), sr, round(len(wav) / sr, 3)


class MmsEngine(Engine):
    """Meta MMS Vietnamese (VITS). 16 kHz, gender speaker only."""

    name = "mms"
    default_device = "cpu"
    default_dtype = "float32"
    sample_rate = 16000

    def load(self):
        import torch
        from transformers import VitsModel

        self._torch = torch
        self._model = VitsModel.from_pretrained(self.model_dir).eval()
        self._vocab = json.load(open(os.path.join(self.model_dir, "vocab.json"), encoding="utf-8"))
        self._vocab["<unk>"] = 0
        self._ready = True

    def voices(self) -> list:
        # MMS ships one unconditioned waveform; the two app voices map to the
        # same model, and rate/pitch in the browser provide the difference.
        return [
            {"name": "Nam", "id": 0, "gender": "nam", "description": "giọng nam trung tính"},
            {"name": "Nữ", "id": 0, "gender": "nữ", "description": "giọng nữ trung tính"},
        ]

    def _encode(self, text: str) -> list:
        # Verified token-for-token against transformers' VitsTokenizer with
        # add_blank=True: lowercase, drop anything outside vocab, pad between
        # and after every character. No NFD — the vocab already holds accents.
        chars = [c for c in text.lower() if c in self._vocab]
        if not chars:
            raise ValueError("No pronounceable characters in text")
        interspersed = [0] * (len(chars) * 2 + 1)
        interspersed[1::2] = chars
        return [self._vocab.get(c, 0) for c in interspersed]

    def synth(self, text, voice, speed):
        torch = self._torch
        ids = self._encode(text)
        with self._lock, torch.no_grad():
            wav = self._model(input_ids=torch.LongTensor([ids])).waveform[0].numpy()
        return wav_bytes(wav, self.sample_rate), self.sample_rate, round(len(wav) / self.sample_rate, 3)


class KokoroEngine(Engine):
    """Kokoro-Vietnamese ONNX (contextboxai). 24 kHz, 14 Vietnamese voice packs.

    Differs from upstream Kokoro-82M in three ways that all matter here: input
    is phonemised via vig2p rather than looked up per character, `speed` is a
    scalar rather than a 1-element tensor, and voices ship as torch .pt files
    indexed by phoneme count rather than fixed-size .bin packs.
    """

    name = "kokoro"
    default_device = "cpu"
    default_dtype = "float32"
    sample_rate = 24000

    def load(self):
        import numpy as np
        import onnxruntime as ort
        import torch
        from vig2p import phonemize_text

        self._np = np
        self._phonemize = phonemize_text
        self._torch = torch

        opts = ort.SessionOptions()
        opts.intra_op_num_threads = int(os.environ.get("ONNX_THREADS", "4"))
        providers = (["CUDAExecutionProvider", "CPUExecutionProvider"]
                     if self.device.startswith("cuda") else ["CPUExecutionProvider"])
        self._sess = ort.InferenceSession(
            os.path.join(self.model_dir, "kokoro_vi.onnx"),
            sess_options=opts, providers=providers)

        config = json.load(open(os.path.join(self.model_dir, "config.json"), encoding="utf-8"))
        self._vocab = config["vocab"]

        self._packs = {}
        meta = json.load(open(os.path.join(self.model_dir, "voices.json"), encoding="utf-8"))
        for vid, m in meta.items():
            self._packs[norm(vid)] = {"label": m["label"], "path": m["filename"]}
        if not self._packs:
            raise RuntimeError("voices.json is empty")
        self._default = norm(next(iter(meta)))
        self._ready = True

    def voices(self) -> list:
        return [{"name": pack["label"], "id": i, "voice_id": vid}
                for i, (vid, pack) in enumerate(sorted(
                    self._packs.items(), key=lambda kv: kv[1]["label"]))]

    def _encode(self, phonemes: str):
        np = self._np
        ids = [self._vocab[c] for c in phonemes if c in self._vocab]
        if not ids:
            raise ValueError("Không tạo được phoneme cho câu này")
        if len(ids) + 2 > 512:
            # The graph has a fixed 512-token context; trim rather than fail.
            ids = ids[:510]
        return np.asarray([[0, *ids, 0]], dtype=np.int64), len(ids)

    def _style(self, voice: Optional[str], phoneme_count: int):
        np = self._np
        entry = self._packs.get(norm(voice or "")) or self._packs[self._default]
        path = os.path.join(self.model_dir, entry["path"])
        if not os.path.exists(path):
            raise ValueError(f"Thiếu voicepack: {entry['path']}")
        pack = self._torch.load(path, map_location="cpu", weights_only=False)
        if hasattr(pack, "detach"):
            pack = pack.detach().cpu().numpy()
        pack = np.asarray(pack, dtype=np.float32)
        if pack.ndim != 3 or pack.shape[1:] != (1, 256):
            raise RuntimeError(f"voicepack shape {pack.shape} không hợp lệ")
        # The pack holds one style vector per phoneme; take the last one reached.
        return np.asarray(pack[min(phoneme_count, pack.shape[0]) - 1], dtype=np.float32)

    def synth(self, text, voice, speed):
        np = self._np
        ids, n = self._encode(self._phonemize(text))
        style = self._style(voice, n)
        with self._lock:
            out = self._sess.run(None, {
                "input_ids": ids,
                "ref_s": style,
                "speed": np.asarray(float(speed), dtype=np.float32),
            })
        wav = np.asarray(out[0]).ravel()
        return wav_bytes(wav, self.sample_rate), self.sample_rate, round(len(wav) / self.sample_rate, 3)


ENGINES = {e.name: e for e in (VieNeuEngine, MmsEngine, KokoroEngine)}


class Handler(BaseHTTPRequestHandler):
    engine: Optional[Engine] = None

    def _reply(self, code: int, payload: dict):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            self._reply(200, {"ok": self.engine._ready, "engine": self.engine.name, "device": self.engine.device})
        elif self.path == "/voices":
            self._reply(200, {"engine": self.engine.name, "voices": self.engine.voices()})
        else:
            self._reply(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/synthesize":
            self._reply(404, {"error": "not found"})
            return
        try:
            raw = self.rfile.read(int(self.headers.get("Content-Length", 0)))
            data = json.loads(raw or b"{}")
        except ValueError as e:
            self._reply(400, {"error": f"invalid JSON: {e}"})
            return

        text = (data.get("text") or "").strip()
        if not text:
            self._reply(400, {"error": "text is required"})
            return
        if len(text) > self.engine.max_chars:
            self._reply(413, {"error": f"text too long: {len(text)} chars (max {self.engine.max_chars})"})

        try:
            wav, sr, dur = self.engine.synth(
                text, data.get("voice"), float(data.get("speed", 1.0) or 1.0)
            )
        except Exception as e:  # noqa: BLE001 - surfaced to the client verbatim
            logger.error("Inference failed: %s", e, exc_info=True)
            self._reply(500, {"error": str(e)})
            return

        fmt = str(data.get("format") or "wav").lower()
        if fmt == "mp3":
            encoded, mime = encode_mp3(wav, data.get("bitrate"))
            if encoded is None:
                # No ffmpeg available: WAV still works, just heavier.
                self._reply(200, {
                    "engine": self.engine.name,
                    "wav_base64": base64.b64encode(wav).decode("ascii"),
                    "sample_rate": sr,
                    "duration_sec": dur,
                    "mimeType": "audio/wav",
                })
                return
            self._reply(200, {
                "engine": self.engine.name,
                "mp3_base64": encoded,
                "mimeType": mime,
                "sample_rate": sr,
                "duration_sec": dur,
            })
            return

        self._reply(200, {
            "engine": self.engine.name,
            "wav_base64": base64.b64encode(wav).decode("ascii"),
            "sample_rate": sr,
            "duration_sec": dur,
        })

    def log_message(self, fmt, *args):
        logger.info("%s %s", self.address_string(), fmt % args)


def main():
    p = argparse.ArgumentParser(description="Unified local TTS daemon")
    p.add_argument("--engine", required=True, choices=sorted(ENGINES))
    p.add_argument("--port", type=int, required=True)
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--model-dir", required=True)
    p.add_argument("--device", help="cpu | cuda | cuda:0 (default: per-engine)")
    p.add_argument("--dtype", help="float32 | float16 | bfloat16 (default: per-engine)")
    args = p.parse_args()

    cls = ENGINES[args.engine]
    engine = cls(args.model_dir, args.device or cls.default_device, args.dtype or cls.default_dtype)
    logger.info("Loading %s from %s on %s (%s)", cls.name, args.model_dir, engine.device, engine.dtype)
    engine.load()
    Handler.engine = engine
    print(f"[READY] engine={cls.name} port={args.port} device={engine.device}", flush=True)
    ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
