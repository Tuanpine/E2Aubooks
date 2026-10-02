export type AmbientSoundType = 'none' | 'rain' | 'fireplace' | 'waves' | 'night' | 'lofi';

export interface AmbientTrack {
  id: AmbientSoundType;
  name: string;
  emoji: string;
  description: string;
}

export const AMBIENT_TRACKS: AmbientTrack[] = [
  {
    id: 'none',
    name: 'Tắt nhạc nền',
    emoji: '🔇',
    description: 'Chỉ nghe giọng đọc thuần túy',
  },
  {
    id: 'rain',
    name: 'Mưa rơi rả rích',
    emoji: '🌧️',
    description: 'Tiếng mưa rơi êm dềm, tăng khả năng tập trung và tĩnh tâm',
  },
  {
    id: 'fireplace',
    name: 'Lò sưởi bập bùng',
    emoji: '🔥',
    description: 'Tiếng củi lách tách ấm cúng bên ánh lửa',
  },
  {
    id: 'waves',
    name: 'Sóng biển đêm',
    emoji: '🌊',
    description: 'Từng đợt sóng biển dạt dào, nhịp điệu thư giãn sâu',
  },
  {
    id: 'night',
    name: 'Rừng đêm thanh tịnh',
    emoji: '🦗',
    description: 'Tiếng dế mèn và côn trùng đêm hè thanh bình nơi miền quê',
  },
  {
    id: 'lofi',
    name: 'Lofi Piano không lời',
    emoji: '🎹',
    description: 'Giai điệu piano lofi chậm rãi, ấm áp đọc sách thư thái',
  },
];

const LOFI_CHORDS = [
  [261.63, 329.63, 392.0, 493.88], // Cmaj7
  [220.0, 261.63, 329.63, 392.0],  // Am7
  [174.61, 220.0, 261.63, 329.63], // Fmaj7
  [196.0, 246.94, 293.66, 349.23], // G7
];
const LOFI_CHORD_SECONDS = 4.2;

/**
 * A sampler for one ambient bed. Returns the sample value at index `i`.
 *
 * One implementation for both jobs: the player renders it live through an
 * AudioContext, and the exporter calls it per sample while mixing a WAV. A
 * second copy is how preview and export drifted into sounding different.
 *
 * Stateful (the noise filters carry state across samples), so build a fresh
 * one per bed -- a resumed one jumps. Level is roughly -20 dBFS: this is a bed
 * under a voice, not a track.
 *
 * ponytail: white noise, not a bundled audio file. Swap in fetch+decodeAudioData
 * if a real recording is ever wanted; the call sites do not change.
 */
export function createAmbientSampler(kind: AmbientSoundType): (i: number, sampleRate: number) => number {
  // Pink-noise filter state (rain) and brown-noise integrator (fire, waves).
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  let lastOut = 0;
  const white = () => Math.random() * 2 - 1;

  switch (kind) {
    case 'rain':
      return (_i, _sr) => {
        const w = white();
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.96900 * b2 + w * 0.1538520;
        b3 = 0.86650 * b3 + w * 0.3104856;
        b4 = 0.55000 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.0168980;
        b6 = w * 0.115926;
        // The preview used to lowpass this at 950 Hz, which is what kept it
        // quiet. Rendered flat it peaks near 8, so scale to a usable bed level.
        return (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.045;
      };

    case 'fireplace':
      return () => {
        // Brown noise bed plus an occasional crackle.
        lastOut = (lastOut + 0.02 * white()) / 1.02;
        const pop = Math.random() < 0.0008 ? white() * 0.7 : 0;
        return lastOut * 0.8 + pop;
      };

    case 'waves':
      return (i, sr) => {
        lastOut = (lastOut + 0.02 * white()) / 1.02;
        // 8-second swell, the same cycle the preview used to drive its filter.
        const swell = (Math.sin(2 * Math.PI * 0.12 * (i / sr)) + 1) * 0.5;
        return lastOut * 0.9 * swell * 2.2;
      };

    case 'night':
      // Crickets: a high tone amplitude-gated at ~14 Hz.
      return (i, sr) => {
        const t = i / sr;
        const chirp = Math.max(0, Math.sin(2 * Math.PI * 14 * t));
        return Math.sin(2 * Math.PI * 4400 * t) * chirp * 0.05;
      };

    case 'lofi':
      return (i, sr) => {
        const t = i / sr;
        const chord = LOFI_CHORDS[Math.floor(t / LOFI_CHORD_SECONDS) % LOFI_CHORDS.length];
        // One note per 80 ms, 4 s decay -- matches the old scheduled envelopes.
        let out = 0;
        for (let n2 = 0; n2 < chord.length; n2++) {
          const start = n2 * 0.08;
          const age = t - Math.floor(t / LOFI_CHORD_SECONDS) * LOFI_CHORD_SECONDS - start;
          if (age < 0 || age > 4.0) continue;
          const env = age < 0.15
            ? age / 0.15
            : Math.exp(-(age - 0.15) * 1.1);
          out += Math.sin(2 * Math.PI * chord[n2] * t) * env;
        }
        return out * 0.05;
      };

    default:
      return () => 0;
  }
}

class AmbientSoundEngine {
  private ctx: AudioContext | null = null;
  private currentTrack: AmbientSoundType = 'none';
  private source: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private volume: number = 0.25; // Default 25% volume so it doesn't overpower speech
  private isMuted: boolean = false;

  private getAudioContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.gainNode && !this.isMuted) {
      this.gainNode.gain.setTargetAtTime(this.volume, this.getAudioContext().currentTime, 0.1);
    }
  }

  public getVolume(): number {
    return this.volume;
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.gainNode) {
      const target = this.isMuted ? 0 : this.volume;
      this.gainNode.gain.setTargetAtTime(target, this.getAudioContext().currentTime, 0.1);
    }
    return this.isMuted;
  }

  public getCurrentTrack(): AmbientSoundType {
    return this.currentTrack;
  }

  public playTrack(track: AmbientSoundType) {
    this.stop();
    this.currentTrack = track;
    if (track === 'none') return;

    const ctx = this.getAudioContext();
    this.gainNode = ctx.createGain();
    this.gainNode.gain.setValueAtTime(this.isMuted ? 0 : this.volume, ctx.currentTime);
    this.gainNode.connect(ctx.destination);

    // Render the bed into a looped buffer using the same sampler the exporter
    // mixes with, so what you hear in the player is what lands in the file.
    const sampleAt = createAmbientSampler(track);
    const seconds = track === 'waves' ? 8 : 4;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const out = buffer.getChannelData(0);
    for (let i = 0; i < out.length; i++) out[i] = sampleAt(i, ctx.sampleRate);

    this.source = ctx.createBufferSource();
    this.source.buffer = buffer;
    this.source.loop = true;
    this.source.connect(this.gainNode);
    this.source.start();
  }

  public stop() {
    if (this.source) {
      try {
        this.source.stop();
        this.source.disconnect();
      } catch { /* already stopped */ }
      this.source = null;
    }
    if (this.gainNode) {
      try {
        this.gainNode.disconnect();
      } catch { /* already disconnected */ }
      this.gainNode = null;
    }
    this.currentTrack = 'none';
  }
}

export const ambientEngine = new AmbientSoundEngine();
