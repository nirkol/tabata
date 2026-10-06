import { describe, expect, it } from 'vitest';
import { Countdown, countdownBeeps } from './countdown';
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

  it('uses the name as the title, or the duration when the name is empty', () => {
    expect(timerTitle({ name: 'Plank', durationSec: 60 })).toBe('Plank');
    expect(timerTitle({ name: '  ', durationSec: 120 })).toBe('2 minutes');
  });

  it('sorts from short to long', () => {
    const t = [600, 60, 300, 120].map((s) => createTimer({ name: '', durationSec: s }));
    expect(sortTimers(t).map((x) => x.durationSec)).toEqual([60, 120, 300, 600]);
  });

  it('rejects invalid stored timers', () => {
    expect(sanitizeTimer({ durationSec: 0 })).toBeNull();
    expect(sanitizeTimer({ durationSec: 1.5 })).toBeNull();
    expect(sanitizeTimer({ durationSec: 3 * 3600 + 1 })).toBeNull();
    expect(sanitizeTimer({ id: 'a', name: ' x ', durationSec: 90 })).toMatchObject({ id: 'a', name: 'x', durationSec: 90 });
  });
});

describe('timer storage', () => {
  it('creates 1, 2, 5 and 10 minute presets on first use, then keeps what the user saved', () => {
    const store = memoryStore();
    const s = new LocalAppStorage(store);
    expect(s.loadTimers().map((t) => t.durationSec)).toEqual([60, 120, 300, 600]);
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
