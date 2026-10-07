import { describe, expect, it } from 'vitest';
import { Stopwatch, formatStopwatch } from './stopwatch';

describe('Stopwatch', () => {
  it('counts up from 0, pauses, resumes, stops and resets', () => {
    let now = 1000;
    const w = new Stopwatch(() => now);
    expect(w.getStatus()).toBe('idle');
    expect(w.elapsedMs()).toBe(0);
    w.start();
    now += 5000;
    expect(w.elapsedMs()).toBe(5000);
    w.pause();
    now += 60_000; // paused time doesn't count
    expect(w.elapsedMs()).toBe(5000);
    w.start(); // resume
    now += 2000;
    expect(w.elapsedMs()).toBe(7000);
    w.stop();
    now += 9000;
    expect(w.getStatus()).toBe('stopped');
    expect(w.elapsedMs()).toBe(7000);
    w.start(); // a new run starts from 0
    now += 1000;
    expect(w.elapsedMs()).toBe(1000);
    w.reset();
    expect(w.getStatus()).toBe('idle');
    expect(w.elapsedMs()).toBe(0);
  });

  it('applies the speed factor', () => {
    let now = 0;
    const w = new Stopwatch(() => now, 60);
    w.start();
    now += 1000;
    expect(w.elapsedMs()).toBe(60_000);
  });

  it('formats as hh:mm:ss', () => {
    expect(formatStopwatch(0)).toBe('00:00:00');
    expect(formatStopwatch(999)).toBe('00:00:00');
    expect(formatStopwatch(61_000)).toBe('00:01:01');
    expect(formatStopwatch((10 * 3600 + 5 * 60 + 9) * 1000)).toBe('10:05:09');
  });
});
