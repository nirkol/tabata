import { describe, expect, it } from 'vitest';
import { Countdown, countdownBeeps, timerStartCallDue, timerTenCallDue } from './countdown';
import { createTimer, defaultTimers, durationWords, sanitizeTimer, sortTimers, timerTitle } from './model';
import { KEYS, LocalAppStorage, type KeyValueStore } from '../storage/storage';

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

describe('timer model', () => {
  it('describes durations in words', () => {
    expect(durationWords(1)).toBe('1 second');
    expect(durationWords(45)).toBe('45 seconds');
    expect(durationWords(60)).toBe('1 minute');
    expect(durationWords(150)).toBe('2 minutes 30 seconds');
    expect(durationWords(5400)).toBe('1 hour 30 minutes');
  });

  it('refers to a timer by its duration', () => {
    expect(timerTitle({ durationSec: 120 })).toBe('2 minutes');
  });

  it('sorts from short to long', () => {
    const t = [600, 60, 300, 120].map((s) => createTimer(s));
    expect(sortTimers(t).map((x) => x.durationSec)).toEqual([60, 120, 300, 600]);
  });

  it('rejects invalid stored timers', () => {
    expect(sanitizeTimer({ durationSec: 0 })).toBeNull();
    expect(sanitizeTimer({ durationSec: 1.5 })).toBeNull();
    expect(sanitizeTimer({ durationSec: 3 * 3600 + 1 })).toBeNull();
    // Older saved timers may still carry a name: it's dropped.
    const t = sanitizeTimer({ id: 'a', name: 'x', durationSec: 90 });
    expect(t).toMatchObject({ id: 'a', durationSec: 90 });
    expect(t).not.toHaveProperty('name');
  });
});

describe('timer storage', () => {
  it('creates 2, 3, 5 and 10 minute presets on first use, then keeps what the user saved', () => {
    const store = memoryStore();
    const s = new LocalAppStorage(store);
    expect(s.loadTimers().map((t) => t.durationSec)).toEqual([120, 180, 300, 600]);
    expect(store.data.has(KEYS.timers)).toBe(true);
    s.saveTimers([]);
    expect(new LocalAppStorage(store).loadTimers()).toEqual([]);
    const t = defaultTimers()[0];
    s.saveTimers([t]);
    expect(new LocalAppStorage(store).loadTimers()).toEqual([t]);
  });
});

describe('Countdown', () => {
  it('counts down from timestamps, pauses and finishes', () => {
    let now = 1000;
    const c = new Countdown(10, () => now);
    c.start();
    now += 4000;
    expect(c.remainingMs()).toBe(6000);
    c.pause();
    now += 60_000; // paused time doesn't count
    expect(c.getStatus()).toBe('paused');
    expect(c.remainingMs()).toBe(6000);
    c.resume();
    now += 3000;
    expect(c.fractionRemaining()).toBeCloseTo(0.3);
    now += 10_000;
    expect(c.getStatus()).toBe('done');
    expect(c.remainingMs()).toBe(0);
  });

  it('applies the speed factor', () => {
    let now = 0;
    const c = new Countdown(60, () => now, 10);
    c.start();
    now += 1000;
    expect(c.elapsedMs()).toBe(10_000);
  });

  it('beeps 4/3/2/1 s before the end, then the finish sound', () => {
    expect(countdownBeeps(60)).toEqual([
      { atMs: 56_000, kind: 'short', sound: 'work' },
      { atMs: 57_000, kind: 'short', sound: 'work' },
      { atMs: 58_000, kind: 'short', sound: 'work' },
      { atMs: 59_000, kind: 'short', sound: 'work' },
      { atMs: 60_000, kind: 'finish', sound: 'work' },
    ]);
    expect(countdownBeeps(2).map((b) => b.atMs)).toEqual([1000, 2000]);
  });
});

describe('timer voice cues', () => {
  it('says "Start!" at the start and "Ten!" 10 s before the end', () => {
    let now = 0;
    const c = new Countdown(60, () => now);
    c.start();
    expect(timerStartCallDue(c, false)).toBe(true);
    expect(timerStartCallDue(c, true)).toBe(false);
    now = 49_000;
    expect(timerTenCallDue(c, false)).toBe(false);
    now = 50_200;
    expect(timerStartCallDue(c, false)).toBe(false);
    expect(timerTenCallDue(c, false)).toBe(true);
    expect(timerTenCallDue(c, true)).toBe(false);
    now = 52_000; // too late: skipped
    expect(timerTenCallDue(c, false)).toBe(false);
  });

  it('has no "Ten!" for timers of 10 s or less, and none while paused', () => {
    let now = 0;
    const short = new Countdown(10, () => now);
    short.start();
    expect(timerTenCallDue(short, false)).toBe(false);
    const c = new Countdown(20, () => now);
    c.start();
    now = 10_100;
    c.pause();
    expect(timerTenCallDue(c, false)).toBe(false);
  });
});
