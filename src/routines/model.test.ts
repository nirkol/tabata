import { describe, expect, it } from 'vitest';
import { DEFAULT_FIELDS, createRoutine, nextRoutineName, routineStats, validateRoutine, type RoutineFields } from './model';

const valid: RoutineFields = { name: 'Test', ...DEFAULT_FIELDS, sets: 2 };

describe('validateRoutine (SPEC §3)', () => {
  it('accepts the defaults', () => {
    expect(validateRoutine(valid)).toEqual({});
  });

  const cases: [keyof RoutineFields, number, number, string][] = [
    ['workSec', 1, 600, 'Must be between 0:01 and 10:00'],
    ['restSec', 1, 180, 'Must be between 0:01 and 3:00'],
    ['intervals', 1, 20, 'Must be between 1 and 20'],
    ['sets', 1, 10, 'Must be between 1 and 10'],
    ['setRestSec', 1, 300, 'Must be between 0:01 and 5:00'],
  ];
  for (const [field, min, max, message] of cases) {
    it(`${field}: accepts ${min}–${max}, rejects ${min - 1} and ${max + 1}`, () => {
      expect(validateRoutine({ ...valid, [field]: min })).toEqual({});
      expect(validateRoutine({ ...valid, [field]: max })).toEqual({});
      expect(validateRoutine({ ...valid, [field]: min - 1 })[field]).toBe(message);
      expect(validateRoutine({ ...valid, [field]: max + 1 })[field]).toBe(message);
    });
  }

  it('rejects non-integers and NaN', () => {
    expect(validateRoutine({ ...valid, workSec: 1.5 }).workSec).toBeDefined();
    expect(validateRoutine({ ...valid, intervals: NaN }).intervals).toBeDefined();
  });

  it('does not validate rest between sets when there is only one set (field disabled)', () => {
    expect(validateRoutine({ ...valid, sets: 1, setRestSec: 0 })).toEqual({});
    expect(validateRoutine({ ...valid, sets: 2, setRestSec: 0 }).setRestSec).toBeDefined();
  });

  it('requires a name of 1–40 characters', () => {
    expect(validateRoutine({ ...valid, name: '   ' }).name).toBe('Name is required');
    expect(validateRoutine({ ...valid, name: 'x'.repeat(40) })).toEqual({});
    expect(validateRoutine({ ...valid, name: 'x'.repeat(41) }).name).toBeDefined();
  });
});

describe('nextRoutineName', () => {
  it('uses the next free "Routine N"', () => {
    expect(nextRoutineName([])).toBe('Routine 1');
    expect(nextRoutineName([{ name: 'Routine 1' }, { name: 'Routine 2' }])).toBe('Routine 3');
    expect(nextRoutineName([{ name: 'Routine 1' }, { name: 'Routine 3' }])).toBe('Routine 2');
    expect(nextRoutineName([{ name: 'Classic Tabata' }])).toBe('Routine 1');
  });
});

describe('createRoutine', () => {
  it('assigns a new id even when given an existing routine', () => {
    const a = createRoutine(valid);
    const b = createRoutine(a);
    expect(b.id).not.toBe(a.id);
    expect(b.name).toBe('Test');
  });
});

describe('routineStats', () => {
  it('labels every value on the card', () => {
    const text = (f: RoutineFields) => routineStats(f).map((s) => `${s.label} ${s.value}`).join(' · ');
    expect(text({ ...valid, sets: 1 })).toBe('Work 0:20 · Rest 0:10 · Rounds 8 · Cycles 1');
    expect(text({ ...valid, workSec: 90, sets: 3 })).toBe('Work 1:30 · Rest 0:10 · Rounds 8 · Cycles 3 · Rest between cycles 1:00');
  });
});
