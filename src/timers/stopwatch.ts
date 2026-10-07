import type { Clock } from '../timer/engine';

export type StopwatchStatus = 'idle' | 'running' | 'paused' | 'stopped';

/**
 * A stopwatch counting up from 0 (SPEC §5c). Timestamp-based like the other timers, so it
 * stays exact when the window is in the background.
 */
export class Stopwatch {
  private status: StopwatchStatus = 'idle';
  private accumulatedMs = 0;
  private runningSince = 0;

  constructor(
    private readonly clock: Clock,
    readonly speed = 1,
  ) {}

  /** Starts from 0 (when idle or stopped) or resumes (when paused). */
  start(): void {
    if (this.status === 'running') return;
    if (this.status !== 'paused') this.accumulatedMs = 0;
    this.runningSince = this.clock();
    this.status = 'running';
  }

  pause(): void {
    if (this.status !== 'running') return;
    this.accumulatedMs = this.elapsedMs();
    this.status = 'paused';
  }

  /** Freezes the time; the next start begins again from 0. */
  stop(): void {
    if (this.status !== 'running' && this.status !== 'paused') return;
    this.accumulatedMs = this.elapsedMs();
    this.status = 'stopped';
  }

  /** Back to 00:00:00, not running. */
  reset(): void {
    this.accumulatedMs = 0;
    this.status = 'idle';
  }

  elapsedMs(): number {
    if (this.status !== 'running') return this.accumulatedMs;
    return this.accumulatedMs + (this.clock() - this.runningSince) * this.speed;
  }

  getStatus(): StopwatchStatus {
    return this.status;
  }
}

/** Elapsed time as hh:mm:ss (whole seconds, always two-digit hours). */
export function formatStopwatch(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}
