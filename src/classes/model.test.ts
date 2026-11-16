import { describe, expect, it } from 'vitest';
import { createRoutine } from '../routines/model';
import { totalDurationSec } from '../timer/engine';
import { createTimer } from '../timers/model';
import { KEYS, LocalAppStorage, type KeyValueStore } from '../storage/storage';
import { classDurationSec, createClass, createClassItem, nextClassName, pruneClass, resolveItem, sanitizeClass } from './model';

const routine = createRoutine({ name: 'Tabata', workSec: 20, restSec: 10, intervals: 8, sets: 1, setRestSec: 60 });
const timer = createTimer(120);

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

describe('classes', () => {
  it('names new classes Class 1, Class 2, … skipping names in use', () => {
    expect(nextClassName([])).toBe('Class 1');
    expect(nextClassName([{ name: 'Class 1' }, { name: 'Class 3' }])).toBe('Class 2');
  });

  it('resolves items and adds up the total time', () => {
    const c = { ...createClass('Mon'), items: [createClassItem('routine', routine.id), createClassItem('timer', timer.id), createClassItem('routine', routine.id)] };
    expect(resolveItem(c.items[1], [routine], [timer])?.label).toBe('Timer 2 minutes');
    expect(classDurationSec(c, [routine], [timer])).toBe(2 * totalDurationSec(routine) + 120);
  });

  it('drops items whose routine or timer was deleted', () => {
    const c = { ...createClass('Mon'), items: [createClassItem('routine', routine.id), createClassItem('timer', timer.id)] };
    expect(pruneClass(c, [routine], [timer])).toBe(c);
    expect(pruneClass(c, [], [timer]).items.map((i) => i.kind)).toEqual(['timer']);
  });

  it('sanitizes stored classes', () => {
    expect(sanitizeClass({ name: '  ' })).toBeNull();
    const c = sanitizeClass({ id: 'x', name: ' Mon ', items: [{ kind: 'routine', refId: 'a' }, { kind: 'bogus', refId: 'b' }, { kind: 'timer' }] });
    expect(c?.name).toBe('Mon');
    expect(c?.items).toEqual([expect.objectContaining({ kind: 'routine', refId: 'a' })]);
  });

  it('saves and loads classes (none on a new installation)', () => {
    const store = memoryStore();
    const s = new LocalAppStorage(store);
    expect(s.loadClasses()).toEqual([]);
    const c = { ...createClass('Mon'), items: [createClassItem('timer', timer.id)] };
    s.saveClasses([c]);
    expect(JSON.parse(store.data.get(KEYS.classes)!).version).toBe(1);
    expect(new LocalAppStorage(store).loadClasses()).toEqual([c]);
  });
});
