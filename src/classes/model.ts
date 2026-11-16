import { newId, type Routine } from '../routines/model';
import { totalDurationSec } from '../timer/engine';
import { timerTitle, type PresetTimer } from '../timers/model';

/** One entry in a class: a routine or a preset timer, by id. The same one may appear more than once. */
export interface ClassItem {
  /** Unique within the class (so the same routine can be added twice). */
  id: string;
  kind: 'routine' | 'timer';
  refId: string;
}

/** A class (SPEC §5d): routines and timers that play one after the other. */
export interface WorkoutClass {
  id: string;
  name: string;
  items: ClassItem[];
  createdAt: string;
  updatedAt: string;
}

export const CLASS_NAME_MAX = 40;

/** "Class 1", "Class 2", …: the first number not already used by a class named like that. */
export function nextClassName(classes: readonly Pick<WorkoutClass, 'name'>[]): string {
  const used = new Set(classes.map((c) => c.name.trim()));
  for (let n = 1; ; n++) {
    const name = `Class ${n}`;
    if (!used.has(name)) return name;
  }
}

export function createClass(name: string, now = new Date()): WorkoutClass {
  const iso = now.toISOString();
  return { id: newId(), name, items: [], createdAt: iso, updatedAt: iso };
}

export function createClassItem(kind: ClassItem['kind'], refId: string): ClassItem {
  return { id: newId(), kind, refId };
}

/** What a class item points to, or null if that routine or timer no longer exists. */
export type ResolvedItem =
  | { item: ClassItem; kind: 'routine'; routine: Routine; label: string; durationSec: number }
  | { item: ClassItem; kind: 'timer'; timer: PresetTimer; label: string; durationSec: number };

export function resolveItem(item: ClassItem, routines: readonly Routine[], timers: readonly PresetTimer[]): ResolvedItem | null {
  if (item.kind === 'routine') {
    const routine = routines.find((r) => r.id === item.refId);
    return routine ? { item, kind: 'routine', routine, label: routine.name, durationSec: totalDurationSec(routine) } : null;
  }
  const timer = timers.find((t) => t.id === item.refId);
  return timer ? { item, kind: 'timer', timer, label: `Timer ${timerTitle(timer)}`, durationSec: timer.durationSec } : null;
}

/** Total length of a class: the sum of its routines (with their Get Ready) and timers. */
export function classDurationSec(c: Pick<WorkoutClass, 'items'>, routines: readonly Routine[], timers: readonly PresetTimer[]): number {
  return c.items.reduce((sum, item) => sum + (resolveItem(item, routines, timers)?.durationSec ?? 0), 0);
}

/** Drops items whose routine or timer was deleted. Returns the same object when nothing changed. */
export function pruneClass(c: WorkoutClass, routines: readonly Routine[], timers: readonly PresetTimer[]): WorkoutClass {
  const items = c.items.filter((item) => resolveItem(item, routines, timers) !== null);
  return items.length === c.items.length ? c : { ...c, items };
}

/** Coerces unknown JSON into a valid class, or null if it isn't one. */
export function sanitizeClass(value: unknown): WorkoutClass | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const name = typeof v.name === 'string' ? v.name.trim().slice(0, CLASS_NAME_MAX) : '';
  if (!name) return null;
  const items: ClassItem[] = [];
  if (Array.isArray(v.items)) {
    for (const raw of v.items) {
      if (!raw || typeof raw !== 'object') continue;
      const i = raw as Record<string, unknown>;
      if ((i.kind !== 'routine' && i.kind !== 'timer') || typeof i.refId !== 'string' || !i.refId) continue;
      items.push({ id: typeof i.id === 'string' && i.id ? i.id : newId(), kind: i.kind, refId: i.refId });
    }
  }
  const now = new Date().toISOString();
  return {
    id: typeof v.id === 'string' && v.id ? v.id : newId(),
    name,
    items,
    createdAt: typeof v.createdAt === 'string' ? v.createdAt : now,
    updatedAt: typeof v.updatedAt === 'string' ? v.updatedAt : now,
  };
}
