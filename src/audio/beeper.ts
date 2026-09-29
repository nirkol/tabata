import type { Beep, BeepKind } from '../timer/engine';

/** The subset of the Web Audio API the beeper uses (lets tests pass a fake). */
export interface AudioContextLike {
  readonly currentTime: number;
  readonly state: string;
  readonly destination: AudioNode;
  resume(): Promise<void>;
  createOscillator(): OscillatorNode;
  createGain(): GainNode;
}

export type AudioContextFactory = () => AudioContextLike;

interface Tone {
  freq: number;
  durationSec: number;
}

/** Short countdown beep and the long phase-change beep (SPEC §4.4). */
const TONES: Record<Exclude<BeepKind, 'finish'>, Tone> = {
  short: { freq: 880, durationSec: 0.15 },
  long: { freq: 1320, durationSec: 0.6 },
};
/** "Finished" sound: three long beeps. */
const FINISH_TONE: Tone = { freq: 1320, durationSec: 0.6 };
const FINISH_GAP_SEC = 0.25;
const PEAK = 0.35;
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
  private master: GainNode | null = null;
  private volume = 0.7;
  private muted = false;
  private readonly live = new Set<OscillatorNode>();

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
      this.applyGain();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));
    this.applyGain();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyGain();
  }

  /** Effective output gain (0 when muted or at 0 % volume). */
  get outputGain(): number {
    return this.muted ? 0 : this.volume;
  }

  private applyGain(): void {
    if (this.master && this.ctx) this.master.gain.setValueAtTime(this.outputGain, this.ctx.currentTime);
  }

  /** Plays one short beep now (the "Test beep" button). */
  test(): void {
    this.unlock();
    if (this.ctx) this.tone(TONES.short, this.ctx.currentTime);
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
      this.play(beep.kind, when);
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

  private play(kind: BeepKind, when: number): void {
    if (kind === 'finish') {
      for (let i = 0; i < 3; i++) this.tone(FINISH_TONE, when + i * (FINISH_TONE.durationSec + FINISH_GAP_SEC));
    } else {
      this.tone(TONES[kind], when);
    }
  }

  private tone(tone: Tone, when: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const start = Math.max(when, ctx.currentTime);
    const end = start + tone.durationSec;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(tone.freq, start);
    // Short attack/release ramps avoid clicks.
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(PEAK, start + RAMP_SEC);
    env.gain.setValueAtTime(PEAK, end - RAMP_SEC);
    env.gain.linearRampToValueAtTime(0, end);
    osc.connect(env);
    env.connect(this.master);
    osc.onended = () => {
      this.live.delete(osc);
      osc.disconnect();
      env.disconnect();
    };
    this.live.add(osc);
    osc.start(start);
    osc.stop(end);
  }
}
