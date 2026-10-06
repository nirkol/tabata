import { COUNTDOWN_BEEPS, type Beep, type Clock } from '../timer/engine';

/**
 * A single countdown (preset timers, SPEC §5b). Timestamp-based like TimerEngine:
 * elapsed time is derived from the clock, so it stays exact in the background.
 */
export class Countdown {
  readonly totalMs: number;
  private status: 'idle' | 'running' | 'paused' = 'idle';
  private accumulatedMs = 0;
  private runningSince = 0;

  constructor(
    readonly durationSec: number,
    private readonly clock: Clock,
    readonly speed = 1,
  ) {
    this.totalMs = durationSec * 1000;
  }

  start(): void {
    this.accumulatedMs = 0;
    this.runningSince = this.clock();
    this.status = 'running';
  }

  pause(): void {
    if (this.getStatus() !== 'running') return;
    this.accumulatedMs = this.elapsedMs();
    this.status = 'paused';
  }

  resume(): void {
    if (this.status !== 'paused') return;
    this.runningSince = this.clock();
    this.status = 'running';
  }

  stop(): void {
    this.accumulatedMs = this.elapsedMs();
    this.status = 'idle';
  }

  elapsedMs(): number {
    const ms = this.status === 'running' ? this.accumulatedMs + (this.clock() - this.runningSince) * this.speed : this.accumulatedMs;
    return Math.min(ms, this.totalMs);
  }

  remainingMs(): number {
    return this.totalMs - this.elapsedMs();
  }

  /** 1 at the start, 0 at the end. */
  fractionRemaining(): number {
    return this.remainingMs() / this.totalMs;
  }

  getStatus(): 'idle' | 'running' | 'paused' | 'done' {
    if (this.status !== 'idle' && this.elapsedMs() >= this.totalMs) return 'done';
    return this.status;
  }
}

/** Short beeps at 4/3/2/1 s before the end (those that fit), then the finish sound. */
export function countdownBeeps(durationSec: number): Beep[] {
  const endMs = durationSec * 1000;
  const beeps: Beep[] = COUNTDOWN_BEEPS.filter((s) => s < durationSec).map((s) => ({ atMs: endMs - s * 1000, kind: 'short', sound: 'work' }));
  beeps.push({ atMs: endMs, kind: 'finish', sound: 'work' });
  return beeps;
}
