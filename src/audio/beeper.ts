import type { Beep, BeepKind, BeepSound } from '../timer/engine';

/** The subset of the Web Audio API the beeper uses (lets tests pass a fake). */
export interface AudioContextLike {
  readonly currentTime: number;
  readonly state: string;
  readonly destination: AudioNode;
  resume(): Promise<void>;
  createOscillator(): OscillatorNode;
  createGain(): GainNode;
  /** Only needed for recorded clips (the Mac app's voice cues). */
  createBufferSource?(): AudioBufferSourceNode;
  decodeAudioData?(data: ArrayBuffer, ok: (b: AudioBuffer) => void, err?: (e: unknown) => void): unknown;
}

export type AudioContextFactory = () => AudioContextLike;

interface Overtone {
  /** Frequency as a multiple of the tone's base frequency. */
  ratio: number;
  gain: number;
}

interface Tone {
  freq: number;
  durationSec: number;
  wave: OscillatorType;
  /** Envelope peak; softer waveforms get a higher peak to sound about as loud. */
  peak: number;
  /** Overtones mixed together (default: just the base frequency). */
  partials?: Overtone[];
  /** Percussive: fade out exponentially over the whole duration instead of holding. */
  decay?: boolean;
  /** Pitch at the end, as a multiple of the start pitch (a quick drop sounds percussive). */
  sweepTo?: number;
}

/** The selectable beep styles (Settings). Work and rest each use one of them. */
export const BEEP_STYLES = ['classic', 'soft', 'high', 'low', 'bell'] as const;
export type BeepStyle = (typeof BEEP_STYLES)[number];

export const BEEP_STYLE_LABELS: Record<BeepStyle, string> = {
  classic: 'Classic beep',
  soft: 'Soft beep',
  high: 'High beep',
  low: 'Low beep',
  bell: 'Gym bell',
};

/** Default styles: a gym bell for work, a soft beep for rest. */
export const DEFAULT_BEEP_STYLES: Record<BeepSound, BeepStyle> = { work: 'bell', rest: 'soft' };

/**
 * Each style has a short countdown beep and a long phase-change beep (SPEC §4.4).
 * They are all variations of an interval-timer beep, so every choice still sounds
 * like a workout timer.
 */
const STYLES: Record<BeepStyle, Record<Exclude<BeepKind, 'finish'>, Tone>> = {
  // The original electronic interval-timer beep.
  classic: {
    short: { freq: 880, durationSec: 0.15, wave: 'square', peak: 0.3 },
    long: { freq: 1320, durationSec: 0.6, wave: 'square', peak: 0.3 },
  },
  // Rounder and gentler.
  soft: {
    short: { freq: 587, durationSec: 0.15, wave: 'triangle', peak: 0.8 },
    long: { freq: 880, durationSec: 0.6, wave: 'triangle', peak: 0.8 },
  },
  // Short, crisp and high: cuts through loud music.
  high: {
    short: { freq: 1760, durationSec: 0.1, wave: 'sine', peak: 0.6, partials: [{ ratio: 1, gain: 1 }, { ratio: 2, gain: 0.2 }] },
    long: { freq: 2093, durationSec: 0.5, wave: 'sine', peak: 0.6, partials: [{ ratio: 1, gain: 1 }, { ratio: 2, gain: 0.2 }] },
  },
  // Deeper and fuller; the overtone keeps it audible on laptop speakers.
  low: {
    short: { freq: 440, durationSec: 0.18, wave: 'triangle', peak: 0.9, partials: [{ ratio: 1, gain: 1 }, { ratio: 2, gain: 0.35 }] },
    long: { freq: 660, durationSec: 0.7, wave: 'triangle', peak: 0.9, partials: [{ ratio: 1, gain: 1 }, { ratio: 2, gain: 0.35 }] },
  },
  // Woody "tock" + boxing-ring bell (inharmonic overtones give the metallic ring).
  bell: {
    short: { freq: 1250, durationSec: 0.12, wave: 'sine', peak: 0.9, decay: true, sweepTo: 0.6, partials: [{ ratio: 1, gain: 1 }, { ratio: 2.3, gain: 0.35 }] },
    long: {
      freq: 760,
      durationSec: 1.1,
      wave: 'sine',
      peak: 0.7,
      decay: true,
      partials: [{ ratio: 1, gain: 1 }, { ratio: 2.76, gain: 0.55 }, { ratio: 5.4, gain: 0.3 }, { ratio: 8.93, gain: 0.12 }],
    },
  },
};

/** Length of the encouragement fanfare; the voice starts right after it. */
export const FANFARE_MS = 650;
/** "Finished" sound: three strikes of the long tone, this far apart. */
const FINISH_SPACING_SEC = 0.85;
const RAMP_SEC = 0.005;

/**
 * How far ahead beeps are handed to the audio clock. Background tabs may run
 * JavaScript timers as rarely as once a minute, so the window is much longer
 * than that; the audio clock itself is never throttled (SPEC §4.6).
 */
export const SCHEDULE_AHEAD_MS = 10 * 60 * 1000;

function defaultFactory(): AudioContextLike {
  const Ctor: typeof AudioContext =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  return new Ctor();
}

export class Beeper {
  private ctx: AudioContextLike | null = null;
  /** Mute switch; the two sound buses feed into it. */
  private master: GainNode | null = null;
  private buses: Partial<Record<BeepSound, GainNode>> = {};
  private volumes: Record<BeepSound, number> = { work: 0.7, rest: 0.7 };
  private styles: Record<BeepSound, BeepStyle> = { ...DEFAULT_BEEP_STYLES };
  private muted = false;
  private readonly live = new Set<OscillatorNode>();
  /** Recorded clips (e.g. voice cues): raw audio until the context exists, then decoded. */
  private readonly clipData = new Map<string, ArrayBuffer>();
  private readonly clips = new Map<string, Promise<{ buffer: AudioBuffer; offset: number } | null>>();

  // Run-schedule state.
  private beeps: readonly Beep[] = [];
  private nextIdx = 0;
  private anchorElapsedMs = 0;
  private anchorAudioSec = 0;
  private speed = 1;
  private active = false;

  constructor(private readonly factory: AudioContextFactory = defaultFactory) {}

  /** Creates or resumes the AudioContext. Call from a user click (autoplay rules). */
  unlock(): void {
    if (!this.ctx) {
      this.ctx = this.factory();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      for (const sound of ['work', 'rest'] as const) {
        const bus = this.ctx.createGain();
        bus.connect(this.master);
        this.buses[sound] = bus;
      }
      this.applyGain();
      for (const name of this.clipData.keys()) this.decodeClip(name);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** Adds a recorded clip (WAV/AIFF bytes). It's decoded once audio is unlocked. */
  addClip(name: string, data: ArrayBuffer): void {
    this.clipData.set(name, data);
    if (this.ctx) this.decodeClip(name);
  }

  hasClip(name: string): boolean {
    return this.clipData.has(name);
  }

  private decodeClip(name: string): void {
    const ctx = this.ctx;
    const data = this.clipData.get(name);
    if (!ctx || !data || !ctx.decodeAudioData) return;
    const decode = ctx.decodeAudioData.bind(ctx);
    this.clips.set(
      name,
      new Promise<AudioBuffer>((ok, err) => {
        // Callback form: older Mac WebKit doesn't return a promise.
        const r = decode(data.slice(0), ok, err) as Promise<AudioBuffer> | undefined;
        r?.then?.(ok, err);
      })
        .then((buffer) => ({ buffer, offset: leadingSilenceSec(buffer) }))
        .catch(() => null),
    );
  }

  /**
   * Plays a recorded clip now on the work sound's volume (and mute). Returns false when
   * there is no such clip; `onFail` runs if the clip can't be decoded.
   */
  playClip(name: string, onFail?: () => void): boolean {
    this.unlock();
    const clip = this.clips.get(name);
    const ctx = this.ctx;
    if (!clip || !ctx?.createBufferSource) return false;
    const requested = ctx.currentTime;
    void clip.then((c) => {
      // Still decoding at the first use: play it if it's ready within half a second.
      if (!c) return onFail?.(); // couldn't be decoded
      if (ctx.currentTime - requested > 0.5) return;
      const src = ctx.createBufferSource!();
      src.buffer = c.buffer;
      src.connect(this.buses.work!);
      src.start(ctx.currentTime, c.offset);
    });
    return true;
  }

  /** Chooses the beep style of the work or the rest beeps; applies to beeps scheduled from now on. */
  setStyle(sound: BeepSound, style: BeepStyle): void {
    this.styles[sound] = style;
  }

  getStyle(sound: BeepSound): BeepStyle {
    return this.styles[sound];
  }

  /** Volume (0–1) of the work or the rest beeps. */
  setVolume(sound: BeepSound, volume: number): void {
    this.volumes[sound] = Math.min(1, Math.max(0, volume));
    this.applyGain();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyGain();
  }

  /** Effective output gain of a sound (0 when muted or at 0 % volume). */
  outputGain(sound: BeepSound): number {
    return this.muted ? 0 : this.volumes[sound];
  }

  private applyGain(): void {
    if (!this.master || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.setValueAtTime(this.muted ? 0 : 1, now);
    for (const sound of ['work', 'rest'] as const) this.buses[sound]?.gain.setValueAtTime(this.volumes[sound], now);
  }

  /**
   * A short, bright "ta-da" fanfare (four rising notes of a major chord) played right before
   * the end-of-cycle encouragement, on the work volume. Returns its length in ms.
   */
  fanfare(): number {
    this.unlock();
    if (!this.ctx) return 0;
    const t0 = this.ctx.currentTime + 0.02;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    notes.forEach((freq, i) => {
      const last = i === notes.length - 1;
      this.tone('work', {
        freq,
        durationSec: last ? 0.55 : 0.13,
        wave: 'triangle',
        peak: 0.85,
        decay: last,
        partials: [
          { ratio: 1, gain: 1 },
          { ratio: 2, gain: 0.3 },
          { ratio: 3, gain: 0.12 },
        ],
      }, t0 + i * 0.11);
    });
    return FANFARE_MS;
  }

  /** Plays a short and a long beep of one sound now (the "Test" buttons). */
  test(sound: BeepSound): void {
    this.unlock();
    if (!this.ctx) return;
    const tones = STYLES[this.styles[sound]];
    this.tone(sound, tones.short, this.ctx.currentTime);
    this.tone(sound, tones.long, this.ctx.currentTime + 0.4);
  }

  /**
   * Starts (or restarts after a pause) the beep schedule of a run.
   * `elapsedMs` is the run's elapsed time right now; beeps before it are skipped.
   */
  startRun(beeps: readonly Beep[], elapsedMs: number, speed: number): void {
    this.unlock();
    this.cancel();
    if (!this.ctx) return;
    this.beeps = beeps;
    this.speed = speed;
    this.anchorElapsedMs = elapsedMs;
    this.anchorAudioSec = this.ctx.currentTime;
    this.nextIdx = beeps.findIndex((b) => b.atMs >= elapsedMs);
    if (this.nextIdx < 0) this.nextIdx = beeps.length;
    this.active = true;
    this.sync(elapsedMs);
  }

  /** Hands the audio clock every beep due within the look-ahead window. Call periodically. */
  sync(elapsedMs: number): void {
    if (!this.active || !this.ctx) return;
    const horizon = elapsedMs + SCHEDULE_AHEAD_MS * this.speed;
    while (this.nextIdx < this.beeps.length && this.beeps[this.nextIdx].atMs <= horizon) {
      const beep = this.beeps[this.nextIdx++];
      const when = this.anchorAudioSec + (beep.atMs - this.anchorElapsedMs) / this.speed / 1000;
      this.play(beep, when);
    }
  }

  /** Stops every scheduled or sounding beep (Pause and Stop). */
  cancel(): void {
    this.active = false;
    for (const osc of this.live) {
      try {
        osc.onended = null;
        osc.stop();
        osc.disconnect();
      } catch {
        // Already stopped.
      }
    }
    this.live.clear();
  }

  private play(beep: Beep, when: number): void {
    const tones = STYLES[this.styles[beep.sound]];
    if (beep.kind === 'finish') {
      for (let i = 0; i < 3; i++) this.tone(beep.sound, tones.long, when + i * FINISH_SPACING_SEC);
    } else {
      this.tone(beep.sound, tones[beep.kind], when);
    }
  }

  private tone(sound: BeepSound, tone: Tone, when: number): void {
    const ctx = this.ctx;
    const bus = this.buses[sound];
    if (!ctx || !bus) return;
    const start = Math.max(when, ctx.currentTime);
    const end = start + tone.durationSec;

    // Envelope: short attack (avoids clicks), then hold or percussive decay.
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(tone.peak, start + RAMP_SEC);
    if (tone.decay) {
      env.gain.exponentialRampToValueAtTime(0.0001, end);
    } else {
      env.gain.setValueAtTime(tone.peak, end - RAMP_SEC);
      env.gain.linearRampToValueAtTime(0, end);
    }
    env.connect(bus);

    const partials = tone.partials ?? [{ ratio: 1, gain: 1 }];
    let playing = partials.length;
    for (const p of partials) {
      const osc = ctx.createOscillator();
      const level = ctx.createGain();
      level.gain.setValueAtTime(p.gain, start);
      osc.type = tone.wave;
      osc.frequency.setValueAtTime(tone.freq * p.ratio, start);
      if (tone.sweepTo) osc.frequency.exponentialRampToValueAtTime(tone.freq * p.ratio * tone.sweepTo, end);
      osc.connect(level);
      level.connect(env);
      osc.onended = () => {
        this.live.delete(osc);
        osc.disconnect();
        level.disconnect();
        if (--playing === 0) env.disconnect();
      };
      this.live.add(osc);
      osc.start(start);
      osc.stop(end);
    }
  }
}

/** Seconds of near-silence at the start of a recorded clip (skipped so the voice is on time). */
export function leadingSilenceSec(buffer: AudioBuffer, threshold = 0.02): number {
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    if (Math.abs(data[i]) > threshold) return Math.max(0, i / buffer.sampleRate - 0.01);
  }
  return 0;
}
