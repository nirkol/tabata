import { describe, expect, it } from 'vitest';
import { Beeper, SCHEDULE_AHEAD_MS, type AudioContextLike } from './beeper';
import { beepSchedule, buildPhases } from '../timer/engine';

/** Records every oscillator the beeper starts/stops on a fake audio clock. */
function fakeContext() {
  const started: { freq: number; start: number; stop: number; cancelled: boolean }[] = [];
  const ctx = {
    currentTime: 100,
    state: 'running',
    destination: {} as AudioNode,
    resume: async () => undefined,
    createGain() {
      return {
        gain: { value: 1, setValueAtTime(v: number) { this.value = v; }, linearRampToValueAtTime() {} },
        connect() {},
        disconnect() {},
      } as unknown as GainNode;
    },
    createOscillator() {
      const rec = { freq: 0, start: NaN, stop: NaN, cancelled: false };
      let startCalled = false;
      return {
        type: 'sine',
        frequency: { setValueAtTime: (f: number) => (rec.freq = f) },
        connect() {},
        disconnect() {},
        onended: null,
        start(t: number) {
          rec.start = t;
          startCalled = true;
          started.push(rec);
        },
        stop(t?: number) {
          if (t === undefined && startCalled) rec.cancelled = true;
          else rec.stop = t!;
        },
      } as unknown as OscillatorNode;
    },
  };
  return { ctx: ctx as AudioContextLike & { currentTime: number }, started };
}

const routine = { workSec: 20, restSec: 10, intervals: 2, sets: 1, setRestSec: 60 }; // G5 W20 R10 W20 = 55 s

describe('Beeper', () => {
  it('schedules every beep on the audio clock at the right offsets', () => {
    const { ctx, started } = fakeContext();
    const b = new Beeper(() => ctx);
    const beeps = beepSchedule(buildPhases(routine));
    b.startRun(beeps, 0, 1);
    // 4 phases × (4 short + 1 end) = 20 beeps, but the finish sound is 3 tones → 22 oscillators
    expect(started).toHaveLength(22);
    expect(started.slice(0, 5).map((o) => o.start)).toEqual([101, 102, 103, 104, 105]);
    // short vs long: different length
    expect(started[0].stop - started[0].start).toBeCloseTo(0.15);
    expect(started[4].stop - started[4].start).toBeCloseTo(0.6);
    // finish: three long beeps starting at the end of the run (t = 100 + 55)
    expect(started.slice(-3).map((o) => o.start)).toEqual([155, 155.85, 156.7]);
  });

  it('cancels scheduled beeps on pause and reschedules from the resume point', () => {
    const { ctx, started } = fakeContext();
    const b = new Beeper(() => ctx);
    const beeps = beepSchedule(buildPhases(routine));
    b.startRun(beeps, 0, 1);
    b.cancel();
    expect(started.every((o) => o.cancelled)).toBe(true);

    // Resume 30 s later on the audio clock, at run time 3.5 s (inside Get Ready).
    ctx.currentTime = 130;
    const before = started.length;
    b.startRun(beeps, 3500, 1);
    const resumed = started.slice(before);
    // Remaining in Get Ready: short at 4 s and the long at 5 s → 0.5 s and 1.5 s after resume.
    expect(resumed[0].start).toBeCloseTo(130.5);
    expect(resumed[1].start).toBeCloseTo(131.5);
    expect(resumed).toHaveLength(22 - 3);
  });

  it('scales offsets with the speed flag', () => {
    const { ctx, started } = fakeContext();
    const b = new Beeper(() => ctx);
    b.startRun(beepSchedule(buildPhases(routine)), 0, 10);
    expect(started[0].start).toBeCloseTo(100.1);
  });

  it('only schedules beeps inside the look-ahead window, and sync() adds the rest', () => {
    const { ctx, started } = fakeContext();
    const b = new Beeper(() => ctx);
    const long = { workSec: 600, restSec: 180, intervals: 20, sets: 10, setRestSec: 300 };
    const beeps = beepSchedule(buildPhases(long));
    b.startRun(beeps, 0, 1);
    const first = started.length;
    expect(first).toBeLessThan(beeps.length);
    expect(Math.max(...started.map((o) => o.start)) - 100).toBeLessThanOrEqual(SCHEDULE_AHEAD_MS / 1000);
    b.sync(SCHEDULE_AHEAD_MS); // 10 min later
    expect(started.length).toBeGreaterThan(first);
    // No beep is scheduled twice.
    const times = started.map((o) => o.start);
    expect(new Set(times).size).toBe(times.length);
  });

  it('volume 0 and mute are silent', () => {
    const { ctx } = fakeContext();
    const b = new Beeper(() => ctx);
    b.setVolume(0.7);
    expect(b.outputGain).toBe(0.7);
    b.setVolume(0);
    expect(b.outputGain).toBe(0);
    b.setVolume(0.5);
    b.setMuted(true);
    expect(b.outputGain).toBe(0);
    b.setMuted(false);
    expect(b.outputGain).toBe(0.5);
  });
});
