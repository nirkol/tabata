import { describe, expect, it } from 'vitest';
import { TimerEngine, beepSchedule, buildPhases, intervalsLeft, totalDurationSec, type Phase } from './engine';

const base = { workSec: 20, restSec: 10, intervals: 3, sets: 2, setRestSec: 60 };

/** Compact notation for a phase list, e.g. "G5 W20 R10 S60". */
function notation(phases: Phase[]): string {
  const letter = { getReady: 'G', work: 'W', rest: 'R', setRest: 'S' } as const;
  return phases.map((p) => `${letter[p.kind]}${p.durationSec}`).join(' ');
}

function fakeClock(start = 1000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe('buildPhases (SPEC §3.1)', () => {
  it('matches the spec example: 2 sets, set rest replaces the last rest, final rest skipped', () => {
    expect(notation(buildPhases(base))).toBe('G5 W20 R10 W20 R10 W20 S60 W20 R10 W20 R10 W20');
  });

  it('has no Set Rest with a single set', () => {
    expect(notation(buildPhases({ ...base, sets: 1 }))).toBe('G5 W20 R10 W20 R10 W20');
  });

  it('always starts with a 5 s Get Ready', () => {
    const [first] = buildPhases(base);
    expect(first).toMatchObject({ kind: 'getReady', durationSec: 5, startMs: 0, endMs: 5000 });
  });

  it('handles 1 interval per set: work, set rest, work', () => {
    expect(notation(buildPhases({ ...base, intervals: 1, sets: 3, setRestSec: 30 }))).toBe('G5 W20 S30 W20 S30 W20');
  });

  it('handles 1 interval and 1 set: only Get Ready and one Work', () => {
    expect(notation(buildPhases({ ...base, intervals: 1, sets: 1 }))).toBe('G5 W20');
  });

  it('numbers sets and intervals and makes phases contiguous', () => {
    const phases = buildPhases(base);
    for (let i = 1; i < phases.length; i++) expect(phases[i].startMs).toBe(phases[i - 1].endMs);
    const works = phases.filter((p) => p.kind === 'work').map((p) => `${p.set}.${p.interval}`);
    expect(works).toEqual(['1.1', '1.2', '1.3', '2.1', '2.2', '2.3']);
  });

  it('builds the largest routine (10 sets × 20 intervals)', () => {
    const phases = buildPhases({ workSec: 600, restSec: 180, intervals: 20, sets: 10, setRestSec: 300 });
    // 1 get ready + 200 works + 190 rests + 9 set rests
    expect(phases).toHaveLength(1 + 200 + 190 + 9);
  });
});

describe('totalDurationSec (SPEC §3.2)', () => {
  it('includes Get Ready, rests, set rests and skips the final rest', () => {
    // 5 + 2 × (3×20 + 2×10) + 60 = 225
    expect(totalDurationSec(base)).toBe(225);
  });

  it('classic Tabata 20/10 × 8 × 1 = 5 + 8×20 + 7×10 = 235 s', () => {
    expect(totalDurationSec({ workSec: 20, restSec: 10, intervals: 8, sets: 1, setRestSec: 60 })).toBe(235);
  });

  it('ignores the set rest with a single set', () => {
    expect(totalDurationSec({ ...base, sets: 1, setRestSec: 300 })).toBe(totalDurationSec({ ...base, sets: 1, setRestSec: 1 }));
  });
});

describe('beepSchedule (SPEC §4.4)', () => {
  it('plays 4 short beeps then a long beep at every phase change', () => {
    const phases = buildPhases({ ...base, sets: 1, intervals: 1 }); // G5 W20
    const beeps = beepSchedule(phases);
    expect(beeps).toEqual([
      // Get Ready (0–5 s): short at 1,2,3,4 s, long at 5 s (Work starts)
      { atMs: 1000, kind: 'short' },
      { atMs: 2000, kind: 'short' },
      { atMs: 3000, kind: 'short' },
      { atMs: 4000, kind: 'short' },
      { atMs: 5000, kind: 'long' },
      // Work (5–25 s): short at 21..24 s, then the finish sound at the end
      { atMs: 21000, kind: 'short' },
      { atMs: 22000, kind: 'short' },
      { atMs: 23000, kind: 'short' },
      { atMs: 24000, kind: 'short' },
      { atMs: 25000, kind: 'finish' },
    ]);
  });

  it('beeps in the last seconds of Rest and Set Rest too', () => {
    const phases = buildPhases(base);
    const beeps = beepSchedule(phases);
    for (const p of phases) {
      const inPhase = beeps.filter((b) => b.atMs > p.startMs && b.atMs <= p.endMs);
      expect(inPhase.map((b) => (p.endMs - b.atMs) / 1000)).toEqual([4, 3, 2, 1, 0]);
    }
    expect(beeps.filter((b) => b.kind === 'finish')).toHaveLength(1);
    expect(beeps.at(-1)).toEqual({ atMs: 225000, kind: 'finish' });
  });

  it('only plays the beeps that fit in phases shorter than 5 s', () => {
    const phases = buildPhases({ workSec: 3, restSec: 1, intervals: 2, sets: 1, setRestSec: 60 }); // G5 W3 R1 W3
    const beeps = beepSchedule(phases);
    const rel = (p: Phase) => beeps.filter((b) => b.atMs > p.startMs && b.atMs <= p.endMs).map((b) => `${(p.endMs - b.atMs) / 1000}${b.kind[0]}`);
    expect(rel(phases[1])).toEqual(['2s', '1s', '0l']); // 3 s work
    expect(rel(phases[2])).toEqual(['0l']); // 1 s rest: only the long beep
    expect(rel(phases[3])).toEqual(['2s', '1s', '0f']);
  });
});

describe('TimerEngine', () => {
  it('derives the phase and remaining time from the clock', () => {
    const c = fakeClock();
    const e = new TimerEngine(base, c.now);
    expect(e.snapshot().status).toBe('idle');
    e.start();
    let s = e.snapshot();
    expect(s).toMatchObject({ status: 'running', phaseIndex: 0, phaseRemainingMs: 5000, warning: true, totalRemainingMs: 225000 });
    expect(s.phase?.kind).toBe('getReady');
    expect(s.nextPhase?.kind).toBe('work');

    c.advance(5000 + 3000); // 3 s into the first work
    s = e.snapshot();
    expect(s.phase?.kind).toBe('work');
    expect(s.phaseRemainingMs).toBe(17000);
    expect(s.phaseFractionRemaining).toBeCloseTo(17 / 20);
    expect(s.warning).toBe(false);
    expect(s.intervalsLeft).toBe(3);

    c.advance(12000); // 5 s left: red
    expect(e.snapshot().warning).toBe(true);
    c.advance(-1); // 5.001 s left: not yet red
    expect(e.snapshot().warning).toBe(false);
  });

  it('catches up correctly after a long gap with no updates (background tab)', () => {
    const c = fakeClock();
    const e = new TimerEngine(base, c.now);
    e.start();
    c.advance(5000 + 30000 + 30000 + 20000 + 10000); // G + 2 intervals + work 3 + 10 s of set rest
    const s = e.snapshot();
    expect(s.phase?.kind).toBe('setRest');
    expect(s.phaseRemainingMs).toBe(50000);
    expect(s.intervalsLeft).toBe(0);
    expect(s.nextPhase).toMatchObject({ kind: 'work', set: 2 });
  });

  it('pause freezes time exactly and resume continues from the same point', () => {
    const c = fakeClock();
    const e = new TimerEngine(base, c.now);
    e.start();
    c.advance(12345);
    e.pause();
    const paused = e.snapshot();
    expect(paused.status).toBe('paused');
    c.advance(60000);
    expect(e.snapshot().elapsedMs).toBe(12345);
    e.resume();
    expect(e.snapshot().elapsedMs).toBe(12345);
    c.advance(1000);
    expect(e.snapshot().elapsedMs).toBe(13345);
    expect(e.snapshot().status).toBe('running');
  });

  it('survives many pause/resume cycles without drift', () => {
    const c = fakeClock();
    const e = new TimerEngine(base, c.now);
    e.start();
    for (let i = 0; i < 100; i++) {
      c.advance(1000);
      e.pause();
      c.advance(777);
      e.resume();
    }
    expect(e.elapsedMs()).toBe(100000);
  });

  it('reports done at the end with zero remaining time', () => {
    const c = fakeClock();
    const e = new TimerEngine(base, c.now);
    e.start();
    c.advance(225000 - 1);
    expect(e.snapshot().status).toBe('running');
    c.advance(1);
    const s = e.snapshot();
    expect(s).toMatchObject({ status: 'done', phase: null, phaseIndex: -1, totalRemainingMs: 0, warning: false });
    c.advance(99999);
    expect(e.snapshot().elapsedMs).toBe(225000);
  });

  it('applies the speed multiplier', () => {
    const c = fakeClock();
    const e = new TimerEngine(base, c.now, 10);
    e.start();
    c.advance(500);
    expect(e.snapshot().elapsedMs).toBe(5000);
    expect(e.snapshot().phase?.kind).toBe('work');
  });

  it('ignores invalid transitions', () => {
    const c = fakeClock();
    const e = new TimerEngine(base, c.now);
    e.pause();
    e.resume();
    expect(e.snapshot().status).toBe('idle');
    e.start();
    e.resume();
    expect(e.snapshot().status).toBe('running');
  });
});

describe('intervalsLeft', () => {
  it('counts down as each Work period finishes', () => {
    const phases = buildPhases({ ...base, sets: 1 });
    expect(phases.map((p) => intervalsLeft(p, 3))).toEqual([3, 3, 2, 2, 1, 1]);
  });
});
