import { describe, expect, it } from 'vitest';
import { DEFAULT_PRAISES, DEFAULT_SETTINGS, KEYS, LocalAppStorage, isReddish, pickPraise, sanitizeSettings, type KeyValueStore } from './storage';
import { createRoutine, DEFAULT_FIELDS } from '../routines/model';

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe('LocalAppStorage', () => {
  it('creates the "Classic Tabata" sample routine on first launch', () => {
    const store = memoryStore();
    const routines = new LocalAppStorage(store).loadRoutines();
    expect(routines).toHaveLength(1);
    expect(routines[0]).toMatchObject({ name: 'Classic Tabata', workSec: 20, restSec: 10, intervals: 8, sets: 1 });
    expect(store.data.has(KEYS.routines)).toBe(true);
  });

  it('does not recreate the sample after the user deleted everything', () => {
    const store = memoryStore();
    const s = new LocalAppStorage(store);
    s.saveRoutines([]);
    expect(s.loadRoutines()).toEqual([]);
  });

  it('round-trips routines and settings under versioned keys', () => {
    const store = memoryStore();
    const s = new LocalAppStorage(store);
    const r = createRoutine({ name: 'Mine', ...DEFAULT_FIELDS });
    s.saveRoutines([r]);
    s.saveSettings({ ...DEFAULT_SETTINGS, volume: 0.3, digitSizePct: 55 });
    const s2 = new LocalAppStorage(store);
    expect(s2.loadRoutines()).toEqual([r]);
    expect(s2.loadSettings()).toMatchObject({ volume: 0.3, digitSizePct: 55 });
    expect(JSON.parse(store.data.get(KEYS.routines)!).version).toBe(1);
  });

  it('survives corrupt data', () => {
    const store = memoryStore();
    store.setItem(KEYS.routines, '{not json');
    store.setItem(KEYS.settings, '42');
    const s = new LocalAppStorage(store);
    expect(s.loadSettings()).toEqual(DEFAULT_SETTINGS);
    // Corrupt routines are treated like a first launch.
    expect(s.loadRoutines().map((r) => r.name)).toEqual(['Classic Tabata']);
  });

  it('drops invalid routines', () => {
    const store = memoryStore();
    store.setItem(KEYS.routines, JSON.stringify({ version: 1, routines: [{ name: 'ok', ...DEFAULT_FIELDS }, { name: 'bad', ...DEFAULT_FIELDS, intervals: 99 }] }));
    expect(new LocalAppStorage(store).loadRoutines().map((r) => r.name)).toEqual(['ok']);
  });
});

describe('sanitizeSettings', () => {
  it('keeps valid beep styles and the show-remaining toggle', () => {
    expect(sanitizeSettings({ workStyle: 'high', restStyle: 'low', showRemaining: false })).toMatchObject({ workStyle: 'high', restStyle: 'low', showRemaining: false });
    expect(sanitizeSettings({}).tenCall).toBe(true);
    expect(sanitizeSettings({ tenCall: false }).tenCall).toBe(false);
    expect(sanitizeSettings({}).startCall).toBe(true);
    expect(sanitizeSettings({ startCall: false }).startCall).toBe(false);
    // Unknown (or removed) styles fall back to the defaults.
    expect(sanitizeSettings({ workStyle: 'whistle', restStyle: 'drum', showRemaining: 'no' })).toMatchObject({ workStyle: 'bell', restStyle: 'soft', showRemaining: true });
  });

  it('rejects out-of-range or red values', () => {
    expect(sanitizeSettings({ volume: 2, digitSizePct: 5, digitColor: '#FF0000', muted: 'yes' })).toEqual(DEFAULT_SETTINGS);
  });
});

describe('encouragement statements', () => {
  it('defaults to the 10 statements, switched on', () => {
    const s = sanitizeSettings({});
    expect(s.praiseCall).toBe(true);
    expect(s.praises).toEqual([...DEFAULT_PRAISES]);
    expect(s.praises).toHaveLength(10);
    expect(s.praises[0]).toBe('Great job!');
    expect(s.praises[9]).toBe('Make it happen!');
  });

  it('keeps edited statements, pads to 10 and trims overlong ones', () => {
    const s = sanitizeSettings({ praiseCall: false, praises: ['Go go go!', 5, 'x'.repeat(100)] });
    expect(s.praiseCall).toBe(false);
    expect(s.praises).toHaveLength(10);
    expect(s.praises[0]).toBe('Go go go!');
    expect(s.praises[1]).toBe('');
    expect(s.praises[2]).toHaveLength(60);
  });

  it('does not share the default list between settings objects', () => {
    const a = sanitizeSettings({});
    a.praises[0] = 'changed';
    expect(sanitizeSettings({}).praises[0]).toBe('Great job!');
  });

  it('picks at random, skipping empty statements and the previous one', () => {
    expect(pickPraise(['', '  ', ''], null)).toBeNull();
    expect(pickPraise(['', 'Only one', ''], 'Only one')).toBe('Only one');
    const list = ['A', 'B', 'C'];
    for (let i = 0; i < 50; i++) expect(pickPraise(list, 'B')).not.toBe('B');
    expect(pickPraise(list, null, () => 0)).toBe('A');
    expect(pickPraise(list, null, () => 0.99)).toBe('C');
  });
});

describe('isReddish', () => {
  it('flags reds but not other colors', () => {
    for (const red of ['#FF0000', '#FF3B30', '#E53935', '#D00000', '#ff1a4b']) expect(isReddish(red), red).toBe(true);
    for (const ok of ['#FFFFFF', '#000000', '#FFD60A', '#30D158', '#0A84FF', '#FF9500', '#FFC0CB', '#400000']) expect(isReddish(ok), ok).toBe(false);
  });
});
