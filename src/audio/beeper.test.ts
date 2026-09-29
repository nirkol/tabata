import { describe, expect, it } from 'vitest';
import { BEEP_STYLES, Beeper, SCHEDULE_AHEAD_MS, type AudioContextLike } from './beeper';
import { beepSchedule, buildPhases } from '../timer/engine';

/** Records every oscillator the beeper starts/stops on a fake audio clock. */
function fakeContext() {
  const started: { freq: number; start: number; stop: number; cancelled: boolean; wave: string }[] = [];
  const ctx = {
    currentTime: 100,
    state: 'running',
    destination: {} as AudioNode,
    resume: async () => undefined,
    createGain() {
      return {
        gain: { value: 1, setValueAtTime(v: number) { this.value = v; }, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {},
        disconnect() {},
      } as unknown as GainNode;
    },
    createOscillator() {
      const rec = { freq: 0, start: NaN, stop: NaN, cancelled: false, wave: '' };
      let startCalled = false;
      return {
        set type(w: string) {
          rec.wave = w;
        },
        frequency: { setValueAtTime: (f: number) => (rec.freq = f), exponentialRampToValueAtTime() {} },
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

/** Distinct start times, i.e. one entry per beep however many oscillators it uses. */
function uniqueStarts(list: { start: number }[]): number[] {
  return [...new Set(list.map((o) => +o.start.toFixed(6)))].sort((a, b) => a - b);
}

const routine = { workSec: 20, restSec: 10, intervals: 2, sets: 1, setRestSec: 60 }; // G5 W20 R10 W20 = 55 s

describe('Beeper', () => {
  it('schedules every beep on the audio clock at the right offsets', () => {
    const { ctx, started } = fakeContext();
    const b = new Beeper(() => ctx);
    const beeps = beepSchedule(buildPhases(routine));
    b.startRun(beeps, 0, 1);
    // 4 phases × (4 short + 1 end) = 20 beeps, but the finish sound is 3 strikes → 22 distinct start times
    // (work tones mix several oscillators that start together).
    const strikes = uniqueStarts(started);
    expect(strikes).toHaveLength(22);
    expect(strikes.slice(0, 5)).toEqual([101, 102, 103, 104, 105]);
    // short vs long: different length
    expect(started[0].stop - started[0].start).toBeCloseTo(0.15);
    expect(started[4].stop - started[4].start).toBeCloseTo(0.6);
    // finish: three long beeps starting at the end of the run (t = 100 + 55)
    expect(strikes.slice(-3)).toEqual([155, 155.85, 156.7]);
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
    expect(uniqueStarts(resumed)).toHaveLength(22 - 3);
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
    const keys = started.map((o) => `${o.start}/${o.freq}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('volume 0 and mute are silent; work and rest volumes are separate', () => {
    const { ctx } = fakeContext();
    const b = new Beeper(() => ctx);
    b.setVolume('work', 0.7);
    b.setVolume('rest', 0.4);
    expect(b.outputGain('work')).toBe(0.7);
    expect(b.outputGain('rest')).toBe(0.4);
    b.setVolume('work', 0);
    expect(b.outputGain('work')).toBe(0);
    expect(b.outputGain('rest')).toBe(0.4);
    b.setVolume('work', 0.5);
    b.setMuted(true);
    expect(b.outputGain('work')).toBe(0);
    expect(b.outputGain('rest')).toBe(0);
    b.setMuted(false);
    expect(b.outputGain('work')).toBe(0.5);
  });

  it('plays the selected style for each of work and rest', () => {
    const firstFreqs = (style: (typeof BEEP_STYLES)[number]) => {
      const { ctx, started } = fakeContext();
      const b = new Beeper(() => ctx);
      b.setStyle('work', style);
      b.setStyle('rest', style);
      b.test('work');
      return started.map((o) => o.freq).join(',');
    };
    // All five styles sound different.
    const all = BEEP_STYLES.map(firstFreqs);
    expect(new Set(all).size).toBe(5);

    const { ctx, started } = fakeContext();
    const b = new Beeper(() => ctx);
    b.setStyle('rest', 'drum');
    b.startRun(beepSchedule(buildPhases(routine)), 0, 1);
    // Get Ready now uses the drum; the work beeps keep the default bell.
    expect(started.filter((o) => o.start === 101)[0].freq).toBe(180);
    expect(started.filter((o) => o.start === 121)[0].freq).toBe(1250);
    expect(b.getStyle('work')).toBe('bell');
  });

  it('uses a different sound for rest beeps than for work beeps', () => {
    const { ctx, started } = fakeContext();
    const b = new Beeper(() => ctx);
    b.startRun(beepSchedule(buildPhases(routine)), 0, 1);
    // First 5 beeps are Get Ready (rest sound), the next 4 short ones end the first Work.
    const restShort = started.filter((o) => o.start === 101);
    const workShort = started.filter((o) => o.start === 121);
    const workBell = started.filter((o) => o.start === 125);
    expect(restShort).toHaveLength(1);
    expect(restShort[0].wave).toBe('triangle');
    // Work: a two-partial "tock" and a four-partial bell, no square-wave monitor beep.
    expect(workShort).toHaveLength(2);
    expect(workBell).toHaveLength(4);
    expect(started.some((o) => o.wave === 'square')).toBe(false);
    expect(workShort[0].freq).not.toBe(restShort[0].freq);
  });
});
