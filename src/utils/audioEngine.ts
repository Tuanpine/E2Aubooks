import { AudiobookVoice } from '../types/ebook';
import { toBase64 } from './library';
import { AmbientSoundType } from './ambientSoundscapes';

type LocalEngine = 'vieneu' | 'kokoro' | 'mms';

/**
 * App voice id -> the name its daemon knows.
 * VieNeu uses speaker names; Kokoro uses voices.json keys; MMS has one
 * unconditioned waveform, so its Nam/Nữ entries are labels only and the
 * browser's rate/pitch provide the difference. There is deliberately no
 * lookup table -- the id carries the daemon's own name.
 */
export type { LocalEngine };

/** No-op ambient sampler, for renders that want the speech bed dry. */
const NO_AMBIENT = () => 0;

/** Which local daemon a voice will use, and the name that daemon knows it by. */
export function resolveLocalVoice(voice: AudiobookVoice): { engine: LocalEngine; name: string } | null {
  if (voice.engine === 'native') return null;
  const engine: LocalEngine = voice.engine === 'kokoro' || voice.engine === 'mms' ? voice.engine : 'vieneu';
  // gen_voices.py writes ids as `<engine>_<voiceId>`; strip the prefix and hand
  // the daemon the part it recognises. The display name is the fallback for
  // ids that predate the convention.
  const prefix = `${engine}_`;
  const name = voice.id.startsWith(prefix) ? voice.id.slice(prefix.length) : voice.name;
  return name ? { engine, name } : null;
}

class AudioEngine {
  private currentAudioElement: HTMLAudioElement | null = null;
  // Bumped on every stop() so a cancelled utterance's onEnd cannot chain into
  // the next sentence while the user has already started a different one.
  private generation = 0;
  private audioCache: Map<string, string> = new Map(); // text+voice -> base64 or objectUrl
  private prefetching: Set<string> = new Set(); // in-flight prefetches, avoids duplicate requests

  public stop() {
    this.generation++;

    if (window.speechSynthesis) window.speechSynthesis.cancel();

    if (this.currentAudioElement) {
      this.currentAudioElement.pause();
      this.currentAudioElement.currentTime = 0;
      this.currentAudioElement = null;
    }
  }

  /**
   * Main synthesis and playback entry point
   */
  public async speakText(options: {
    text: string;
    voice: AudiobookVoice;
    rate: number;
    pitch: number;
    volume: number;
    onStart?: () => void;
    onEnd?: () => void;
    onError?: (err: any) => void;
  }) {
    const { text, voice, rate, pitch, volume, onStart, onEnd, onError } = options;
    this.stop();
    // Synthesis is async: if the user clicks another sentence while this one
    // is still waiting on the daemon, the older await must not start playing.
    const myGeneration = this.generation;

    if (!text || !text.trim()) {
      if (onEnd) onEnd();
      return;
    }

    // 1. Local neural TTS. Each engine runs its own daemon, booted on demand.
    //    Engines without a daemon of their own fall back to VieNeu.
    //    Go through resolveLocalVoice so playback and Export agree on the name;
    //    a second lookup here is how they drifted apart.
    const local = resolveLocalVoice(voice);
    if (local) {
      const { engine, name: voiceName } = local;
      try {
        await this.playLocalTts({
          text,
          voice: voiceName,
          engine,
          rate,
          volume,
          onStart,
          onEnd,
          onError,
          generation: myGeneration,
        });
        return;
      } catch (err: any) {
        // Do NOT report the error here: Web Speech is still about to be
        // tried, and reporting would advance the sentence twice per
        // failure (once here, once if Web Speech also fails).
        console.warn(`Local TTS (${engine}) failed, falling back to Web Speech:`, err);
      }
    }

    // 2. Web Speech (system voices) — last resort, so this is where a failure
    //    finally reaches the caller.
    this.playNativeSpeech({
      text,
      voice,
      rate,
      pitch,
      volume,
      onStart,
      onEnd,
      onError,
    });
  }

  /**
   * Synthesize one chunk and return it as a 24 kHz AudioBuffer.
   *
   * Engines differ in native rate (16k/24k/48k); decodeAudioData on an
   * OfflineAudioContext handles the resample in the browser rather than us
   * hand-rolling a sinc filter.
   */
  public async synthesize(
    text: string,
    engine: LocalEngine,
    voice: string,
    targetRate = 24000
  ): Promise<AudioBuffer> {
    const res = await fetch('/api/tts/local', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice, engine }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    if (!data.wav_base64) throw new Error('No audio returned from local TTS daemon');

    const bytes = Uint8Array.from(atob(data.wav_base64), c => c.charCodeAt(0));
    const ctx = new OfflineAudioContext(1, 1, targetRate);
    return ctx.decodeAudioData(bytes.buffer);
  }

  private async playLocalTts(params: {
    text: string;
    voice: string;
    engine: LocalEngine;
    rate: number;
    volume: number;
    onStart?: () => void;
    onEnd?: () => void;
    onError?: (err: any) => void;
    generation: number;
  }) {
    const { text, voice, engine, rate, volume, onStart, onEnd, onError, generation } = params;
    const cacheKey = `local_${engine}_${voice}_${text}`;

    let audioUrl: string;

    if (this.audioCache.has(cacheKey)) {
      audioUrl = this.audioCache.get(cacheKey)!;
    } else {
      const res = await fetch('/api/tts/local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice, engine, speed: rate }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      if (!data.wav_base64) {
        throw new Error('No audio returned from local TTS daemon');
      }

      audioUrl = `data:${data.mimeType || 'audio/wav'};base64,${data.wav_base64}`;
      this.audioCache.set(cacheKey, audioUrl);
    }

    // A newer sentence started while this one awaited the daemon: drop it,
    // otherwise both audios play at once.
    if (generation !== this.generation) return;

    const audio = new Audio(audioUrl);
    this.currentAudioElement = audio;
    audio.playbackRate = Math.min(Math.max(rate, 0.5), 3.0);
    audio.volume = Math.min(Math.max(volume, 0), 1);

    audio.onplay = () => {
      if (onStart) onStart();
    };

    audio.onended = () => {
      this.currentAudioElement = null;
      if (onEnd) onEnd();
    };

    audio.onerror = (e) => {
      this.currentAudioElement = null;
      if (onError) onError(e);
      if (onEnd) onEnd();
    };

    await audio.play();
  }

  private playNativeSpeech(params: {
    text: string;
    voice: AudiobookVoice;
    rate: number;
    pitch: number;
    volume: number;
    onStart?: () => void;
    onEnd?: () => void;
    onError?: (err: any) => void;
  }) {
    const { text, voice, rate, pitch, volume, onStart, onEnd, onError } = params;

    if (!window.speechSynthesis) {
      if (onError) onError(new Error('Trình duyệt không hỗ trợ Web Speech API'));
      if (onEnd) onEnd();
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);

    // Match browser voice by language and name
    const availableVoices = window.speechSynthesis.getVoices();
    let selectedVoice: SpeechSynthesisVoice | null = null;

    // 1. Try matching by preferred voice language
    const langTarget = voice.lang || 'vi-VN';
    const langMatches = availableVoices.filter(v => v.lang.replace('_', '-').toLowerCase().startsWith(langTarget.slice(0, 2).toLowerCase()));

    // 2. Try gender/accent matching
    if (voice.gender === 'female') {
      selectedVoice = langMatches.find(v => /female|nữ|woman|girl|hoa|lan|mai|linh|ngoc|zira/i.test(v.name)) || null;
    } else if (voice.gender === 'male') {
      selectedVoice = langMatches.find(v => /male|nam|man|boy|minh|david|george|anh|hung/i.test(v.name)) || null;
    }

    if (!selectedVoice && langMatches.length > 0) {
      selectedVoice = langMatches[0];
    }

    if (!selectedVoice && availableVoices.length > 0) {
      selectedVoice = availableVoices[0];
    }

    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    utterance.lang = langTarget;
    utterance.rate = Math.min(Math.max(rate, 0.5), 3.0);
    utterance.pitch = Math.min(Math.max(pitch, 0.5), 1.8);
    utterance.volume = Math.min(Math.max(volume, 0), 1);

    utterance.onstart = () => {
      if (onStart) onStart();
    };

    utterance.onend = () => onEnd?.();

    utterance.onerror = (e) => {
      onError?.(e);
      onEnd?.();
    };

    window.speechSynthesis.speak(utterance);
  }

  /**
   * WAV -> MP3 through the server, which shells out to ffmpeg. Returns null
   * when ffmpeg is absent so the caller can keep the WAV.
   */
  /**
   * Synthesizes a sentence the player is about to need, into the same cache
   * playLocalTts reads. Fire-and-forget: a failure here just means the next
   * sentence pays the normal latency.
   */
  public prefetch(text: string, engine: LocalEngine, voice: string, rate = 1.0): void {
    const cacheKey = `local_${engine}_${voice}_${text}`;
    if (!text.trim() || this.audioCache.has(cacheKey) || this.prefetching.has(cacheKey)) return;
    this.prefetching.add(cacheKey);
    fetch('/api/tts/local', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice, engine, speed: rate }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.wav_base64) {
          this.audioCache.set(
            cacheKey,
            `data:${data.mimeType || 'audio/wav'};base64,${data.wav_base64}`
          );
        }
      })
      .catch(() => { /* the next play will synthesize it normally */ })
      .finally(() => this.prefetching.delete(cacheKey));
  }

  /**
   * Renders a flat sentence list to a WAV blob, one daemon call per sentence.
   *
   * Shared by ExportModal and BatchConvertModal so both produce the same file:
   * a 350 ms breath between sentences, 24 kHz, ambient mixed in per sentence.
   * The result is assembled from Int16 Blob parts rather than one Float32
   * array — a 300-minute book is ~1.6 GB as float32 and blows the tab heap.
   *
   * ponytail: strictly sequential; a book renders at roughly real time anyway.
   * Add a worker pool when a 2x GPU makes concurrency worth the VRAM.
   */
  public async synthesizeSentences(
    sentences: string[],
    engine: LocalEngine,
    voice: string,
    onProgress?: (done: number, total: number) => void,
    mixAmbient?: (data: Float32Array) => Blob
  ): Promise<Blob> {
    const sampleRate = 24000;
    const pauseSamples = Math.round(sampleRate * 0.35);
    const parts: Blob[] = [];
    let totalSamples = 0;

    for (let i = 0; i < sentences.length; i++) {
      const buffer = await this.synthesize(sentences[i], engine, voice, sampleRate);
      const data = buffer.getChannelData(0);
      parts.push(mixAmbient ? mixAmbient(data) : this.floatTo16Bit(data, 'none', 0, NO_AMBIENT));
      totalSamples += data.length;
      parts.push(new Blob([new ArrayBuffer(pauseSamples * 2)]));
      totalSamples += pauseSamples;
      onProgress?.(i + 1, sentences.length);
    }

    return this.wavFromPcmParts(parts, totalSamples, sampleRate);
  }

  public async encodeMp3(wavBlob: Blob, bitrateKbps = 96): Promise<Blob | null> {
    const res = await fetch('/api/tts/encode-mp3', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: JSON.stringify({ wav_base64: await toBase64(wavBlob), bitrate: bitrateKbps }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.mp3_base64) return null;
    const bytes = Uint8Array.from(atob(data.mp3_base64), c => c.charCodeAt(0));
    return new Blob([bytes], { type: 'audio/mpeg' });
  }

  /**
   * Convert one sentence to a 16-bit PCM Blob, mixing the ambient bed in.
   * Done per sentence so the whole book is never resident as float32 in the
   * heap — that is what made long exports die without an error.
   *
   * `ambientAt` is bound to one bed already (createAmbientSampler), so the
   * caller builds a fresh one per sentence rather than passing a kind here.
   */
  public floatTo16Bit(
    data: Float32Array,
    ambient: AmbientSoundType,
    ambientVolume: number,
    ambientAt: (index: number, rate: number) => number
  ): Blob {
    const out = new Int16Array(data.length);
    const mix = ambient !== 'none' && ambientVolume > 0;
    for (let i = 0; i < data.length; i++) {
      let sample = data[i];
      if (mix) {
        sample = Math.max(-1, Math.min(1, sample + ambientAt(i, 24000) * ambientVolume));
      }
      sample = Math.max(-1, Math.min(1, sample));
      out[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }
    return new Blob([out.buffer]);
  }

  /** Wrap PCM Blobs in a WAV container without copying them into one array. */
  public wavFromPcmParts(parts: Blob[], totalSamples: number, sampleRate = 24000): Blob {
    const dataSize = totalSamples * 2;
    const header = new ArrayBuffer(44);
    const view = new DataView(header);
    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    this.writeString(view, 8, 'WAVE');
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    this.writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);
    return new Blob([header, ...parts], { type: 'audio/wav' });
  }

  private writeString(view: DataView, offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }
}

export const audioEngine = new AudioEngine();
