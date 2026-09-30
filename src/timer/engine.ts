import { GET_READY_SEC, type RoutineFields } from '../routines/model';

export type PhaseKind = 'getReady' | 'work' | 'rest' | 'setRest';

export interface Phase {
  kind: PhaseKind;
  durationSec: number;
  /** 1-based set number this phase belongs to. */
  set: number;
  /** 1-based interval number within the set (0 for Get Ready). */
  interval: number;
  /** Offset of the phase start from the beginning of the run, in ms. */
  startMs: number;
  endMs: number;
}

type RoutineTiming = Pick<RoutineFields, 'workSec' | 'restSec' | 'intervals' | 'sets' | 'setRestSec'>;

/** Builds the phase sequence following SPEC §3.1. */
export function buildPhases(r: RoutineTiming): Phase[] {
  const phases: Phase[] = [];
  let t = 0;
  const push = (kind: PhaseKind, durationSec: number, set: number, interval: number) => {
    const startMs = t;
    t += durationSec * 1000;
    phases.push({ kind, durationSec, set, interval, startMs, endMs: t });
  };

  push('getReady', GET_READY_SEC, 1, 0);
  for (let set = 1; set <= r.sets; set++) {
    for (let i = 1; i <= r.intervals; i++) {
      push('work', r.workSec, set, i);
      const lastOfSet = i === r.intervals;
      if (!lastOfSet) {
        if (r.restSec > 0) push('rest', r.restSec, set, i); // a 0 s rest is skipped
      }
      else if (set < r.sets) push('setRest', r.setRestSec, set, i); // replaces the last Rest of the set
      // else: the last Rest of the last set is skipped
    }
  }
  return phases;
}

/** Total routine duration in seconds, including Get Ready (SPEC §3.2). */
export function totalDurationSec(r: RoutineTiming): number {
  const phases = buildPhases(r);
  return phases[phases.length - 1].endMs / 1000;
}

export type BeepKind = 'short' | 'long' | 'finish';
/**
 * Which sound family a beep uses: countdowns that end a Work period use the work
 * sound; countdowns that end Get Ready, Rest or Set Rest (i.e. lead into Work)
 * use the rest sound. Each has its own volume setting.
 */
export type BeepSound = 'work' | 'rest';

export interface Beep {
  /** Offset from the start of the run, in ms. */
  atMs: number;
  kind: BeepKind;
  sound: BeepSound;
}

/** Last-seconds countdown length: short beeps at 4, 3, 2, 1 s remaining (SPEC §4.4). */
export const COUNTDOWN_BEEPS = [4, 3, 2, 1] as const;
/** The digits and ring turn red when this many seconds (or fewer) remain. */
export const WARNING_SEC = 5;
/** The spoken "Ten!" call comes this many seconds before the end of a Work period. */
export const TEN_CALL_SEC = 10;
/** A late call (e.g. after the window was hidden) is skipped once this much time has passed. */
export const TEN_CALL_WINDOW_MS = 1500;

/**
 * True when the spoken "Start!" is due: at the start of each running Work period (within a
 * short window, so a late catch-up is skipped), once per phase.
 */
export function startCallDue(s: Snapshot, lastCalledPhase: number): boolean {
  const p = s.phase;
  if (s.status !== 'running' || !p || p.kind !== 'work' || s.phaseIndex === lastCalledPhase) return false;
  const sinceStart = p.durationSec * 1000 - s.phaseRemainingMs;
  return sinceStart >= 0 && sinceStart < TEN_CALL_WINDOW_MS;
}

/**
 * True when the "Ten!" call is due: during a running Work period longer than 10 s, in the
 * moment its remaining time crosses 10 s, and not already called for this phase.
 * Rest, Cycle Rest and Get Ready never get it.
 */
export function tenCallDue(s: Snapshot, lastCalledPhase: number): boolean {
  const p = s.phase;
  if (s.status !== 'running' || !p || p.kind !== 'work' || p.durationSec <= TEN_CALL_SEC) return false;
  if (s.phaseIndex === lastCalledPhase) return false;
  const past = TEN_CALL_SEC * 1000 - s.phaseRemainingMs;
  return past >= 0 && past < TEN_CALL_WINDOW_MS;
}

/**
 * Every beep of a run (SPEC §4.4): short beeps at 4/3/2/1 s before the end of each
 * phase (only those that fit inside the phase), then a long beep at the phase change.
 * The very last phase ends with the "finish" sound instead of the long beep.
 */
export function beepSchedule(phases: readonly Phase[], opts: { voiceStart?: boolean } = {}): Beep[] {
  const beeps: Beep[] = [];
  phases.forEach((p, idx) => {
    const sound: BeepSound = p.kind === 'work' ? 'work' : 'rest';
    for (const s of COUNTDOWN_BEEPS) {
      if (s < p.durationSec) beeps.push({ atMs: p.endMs - s * 1000, kind: 'short', sound });
    }
    const last = idx === phases.length - 1;
    // With the spoken "Start!" on, the voice replaces the long beep that ends a rest-type phase
    // (Get Ready, Rest, Cycle Rest), i.e. the one that marks the start of Work.
    if (!last && opts.voiceStart && p.kind !== 'work') return;
    beeps.push({ atMs: p.endMs, kind: last ? 'finish' : 'long', sound });
  });
  return beeps;
}

export type Status = 'idle' | 'running' | 'paused' | 'done';

export interface Snapshot {
  status: Status;
  /** Run time elapsed so far, in ms (already multiplied by the speed factor). */
  elapsedMs: number;
  totalMs: number;
  /** Index into `phases`; -1 when done. */
  phaseIndex: number;
  phase: Phase | null;
  nextPhase: Phase | null;
  /** Remaining time in the current phase, in ms. */
  phaseRemainingMs: number;
  /** 1 at the start of a phase, 0 at its end. */
  phaseFractionRemaining: number;
  totalRemainingMs: number;
  /**
   * Remaining time of the current set, in ms. A set runs from its first Work to the
   * start of the next set (so it includes the Rest between sets). During Get Ready
   * it is the full length of set 1.
   */
  setRemainingMs: number;
  /** Intervals of the current set whose Work period hasn't finished yet. */
  intervalsLeft: number;
  /** True during the last WARNING_SEC seconds of a phase. */
  warning: boolean;
}

/** A clock returning milliseconds, e.g. `() => performance.now()`. */
export type Clock = () => number;

/**
 * Pure timer state machine (SPEC §8). It stores only timestamps: elapsed time is
 * always `accumulated + (clock() - runningSince) * speed`, and every other value
 * (current phase, remaining time, …) is derived from it. That makes it immune
 * to throttled or delayed timers: a snapshot taken at any moment is correct.
 */
export class TimerEngine {
  readonly phases: Phase[];
  readonly totalMs: number;
  private status: 'idle' | 'running' | 'paused' | 'stopped' = 'idle';
  private accumulatedMs = 0;
  private runningSince = 0;

  constructor(
    readonly routine: RoutineTiming,
    private readonly clock: Clock,
    /** Time multiplier; >1 makes the run go faster (dev speed flag). */
    readonly speed = 1,
  ) {
    this.phases = buildPhases(routine);
    this.totalMs = this.phases[this.phases.length - 1].endMs;
  }

  start(): void {
    if (this.status !== 'idle') return;
    this.accumulatedMs = 0;
    this.runningSince = this.clock();
    this.status = 'running';
  }

  pause(): void {
    if (this.status !== 'running' || this.isFinished()) return;
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
    this.status = 'stopped';
  }

  elapsedMs(): number {
    if (this.status !== 'running') return Math.min(this.accumulatedMs, this.totalMs);
    return Math.min(this.accumulatedMs + (this.clock() - this.runningSince) * this.speed, this.totalMs);
  }

  isFinished(): boolean {
    return this.status !== 'idle' && this.elapsedMs() >= this.totalMs;
  }

  getStatus(): Status {
    if (this.status === 'idle' || this.status === 'stopped') return 'idle';
    if (this.isFinished()) return 'done';
    return this.status;
  }

  /** Index of the phase active at `elapsedMs`, or -1 when the run is over. */
  phaseIndexAt(elapsedMs: number): number {
    if (elapsedMs >= this.totalMs) return -1;
    // Binary search: phases are sorted and contiguous.
    let lo = 0;
    let hi = this.phases.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.phases[mid].endMs <= elapsedMs) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /** Start of a set's first Work period, in ms. */
  setStartMs(set: number): number {
    return this.phases.find((p) => p.set === set && p.kind !== 'getReady')!.startMs;
  }

  /** End of a set, including its Rest between sets, in ms. */
  setEndMs(set: number): number {
    const inSet = this.phases.filter((p) => p.set === set);
    return inSet[inSet.length - 1].endMs; // (no Array.at: older Mac WebKit lacks it)
  }

  snapshot(): Snapshot {
    const status = this.getStatus();
    const elapsedMs = this.elapsedMs();
    const phaseIndex = this.phaseIndexAt(elapsedMs);
    const phase = phaseIndex >= 0 ? this.phases[phaseIndex] : null;
    const nextPhase = phaseIndex >= 0 ? (this.phases[phaseIndex + 1] ?? null) : null;
    const phaseRemainingMs = phase ? phase.endMs - elapsedMs : 0;
    const phaseFractionRemaining = phase ? phaseRemainingMs / (phase.durationSec * 1000) : 0;
    return {
      status,
      elapsedMs,
      totalMs: this.totalMs,
      phaseIndex,
      phase,
      nextPhase,
      phaseRemainingMs,
      phaseFractionRemaining,
      totalRemainingMs: this.totalMs - elapsedMs,
      setRemainingMs: phase ? this.setEndMs(phase.set) - Math.max(elapsedMs, this.setStartMs(phase.set)) : 0,
      intervalsLeft: phase ? intervalsLeft(phase, this.routine.intervals) : 0,
      warning: phase !== null && phaseRemainingMs <= WARNING_SEC * 1000,
    };
  }
}

/**
 * Intervals of the current set not completed yet. An interval counts as completed
 * when its Work period ends (its Rest may be replaced by Set Rest or skipped).
 */
export function intervalsLeft(phase: Phase, intervals: number): number {
  switch (phase.kind) {
    case 'getReady':
      return intervals;
    case 'work':
      return intervals - phase.interval + 1;
    case 'rest':
    case 'setRest':
      return intervals - phase.interval;
  }
}

export const PHASE_LABELS: Record<PhaseKind | 'done', string> = {
  getReady: 'GET READY',
  work: 'WORK',
  rest: 'REST',
  setRest: 'CYCLE REST',
  done: 'DONE',
};
