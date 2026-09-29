import { formatClock } from '../timer/format';

export interface Routine {
  id: string;
  name: string;
  workSec: number;
  restSec: number;
  intervals: number;
  sets: number;
  setRestSec: number;
  createdAt: string;
  updatedAt: string;
}

/** The editable part of a routine (everything except id and timestamps). */
export type RoutineFields = Pick<Routine, 'name' | 'workSec' | 'restSec' | 'intervals' | 'sets' | 'setRestSec'>;

export interface Range {
  min: number;
  max: number;
}

/** Field ranges from SPEC §3. */
export const LIMITS = {
  nameLength: { min: 1, max: 40 },
  workSec: { min: 1, max: 600 },
  restSec: { min: 0, max: 180 }, // 0 = no rest: the next Work starts right away
  intervals: { min: 1, max: 20 },
  sets: { min: 1, max: 10 },
  setRestSec: { min: 1, max: 300 },
} as const satisfies Record<string, Range>;

/** Fixed Get Ready countdown before the first Work period (SPEC §3). */
export const GET_READY_SEC = 5;

export const DEFAULT_FIELDS: Omit<RoutineFields, 'name'> = {
  workSec: 20,
  restSec: 10,
  intervals: 8,
  sets: 1,
  setRestSec: 60,
};

export type NumericField = 'workSec' | 'restSec' | 'intervals' | 'sets' | 'setRestSec';
export type FieldErrors = Partial<Record<keyof RoutineFields, string>>;

const TIME_FIELDS: ReadonlySet<NumericField> = new Set(['workSec', 'restSec', 'setRestSec']);

export function isTimeField(field: NumericField): boolean {
  return TIME_FIELDS.has(field);
}

/** Human-readable range message, e.g. "Must be between 0:01 and 3:00". */
export function rangeMessage(range: Range, time: boolean): string {
  const fmt = (v: number) => (time ? formatClock(v) : String(v));
  return `Must be between ${fmt(range.min)} and ${fmt(range.max)}`;
}

export function validateNumber(field: NumericField, value: number): string | undefined {
  const range = LIMITS[field];
  if (!Number.isInteger(value) || value < range.min || value > range.max) {
    return rangeMessage(range, isTimeField(field));
  }
  return undefined;
}

export function validateName(name: string): string | undefined {
  const trimmed = name.trim();
  if (trimmed.length < LIMITS.nameLength.min) return 'Name is required';
  if (trimmed.length > LIMITS.nameLength.max) return `Name must be at most ${LIMITS.nameLength.max} characters`;
  return undefined;
}

/**
 * Validates every field. "Rest between sets" is only validated when there is more
 * than one set, because the field is disabled otherwise (SPEC §3).
 */
export function validateRoutine(fields: RoutineFields): FieldErrors {
  const errors: FieldErrors = {};
  const nameError = validateName(fields.name);
  if (nameError) errors.name = nameError;
  const numeric: NumericField[] = ['workSec', 'restSec', 'intervals', 'sets', 'setRestSec'];
  for (const field of numeric) {
    if (field === 'setRestSec' && fields.sets === 1) continue;
    const error = validateNumber(field, fields[field]);
    if (error) errors[field] = error;
  }
  return errors;
}

export function isValidRoutine(fields: RoutineFields): boolean {
  return Object.keys(validateRoutine(fields)).length === 0;
}

/** The smallest free "Routine N" name (N ≥ 1). */
export function nextRoutineName(existing: readonly { name: string }[]): string {
  const taken = new Set(existing.map((r) => r.name.trim()));
  let n = 1;
  while (taken.has(`Routine ${n}`)) n++;
  return `Routine ${n}`;
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'r-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export function createRoutine(fields: RoutineFields, now = new Date()): Routine {
  const iso = now.toISOString();
  const { workSec, restSec, intervals, sets, setRestSec } = fields;
  return {
    id: newId(),
    name: fields.name.trim(),
    workSec,
    restSec,
    intervals,
    sets,
    setRestSec,
    createdAt: iso,
    updatedAt: iso,
  };
}

export function sampleRoutine(): Routine {
  return createRoutine({ name: 'Classic Tabata', ...DEFAULT_FIELDS });
}

/**
 * Labeled values for a routine card (SPEC §5.1), e.g. Work 0:20 · Rest 0:10 ·
 * Intervals 8 · Sets 2 · Rest between sets 1:00. Rest between sets only
 * appears with 2+ sets, since it isn't used otherwise.
 */
export function routineStats(r: RoutineFields): { label: string; value: string }[] {
  const stats = [
    { label: 'Work', value: formatClock(r.workSec) },
    { label: 'Rest', value: formatClock(r.restSec) },
    { label: 'Rounds', value: String(r.intervals) },
    { label: 'Cycles', value: String(r.sets) },
  ];
  if (r.sets > 1) stats.push({ label: 'Rest between cycles', value: formatClock(r.setRestSec) });
  return stats;
}
