import { newId, type Range } from '../routines/model';

/** A preset countdown timer (SPEC §5b). */
export interface PresetTimer {
  id: string;
  /** Timers have no name: they are shown by their duration. */
  durationSec: number;
  createdAt: string;
  updatedAt: string;
}

export const TIMER_LIMITS = {
  durationSec: { min: 1, max: 180 * 60 }, // up to 3 hours
  minutes: { min: 0, max: 180 },
  seconds: { min: 0, max: 59 },
} as const satisfies Record<string, Range>;

/** Presets created on first launch. */
export const DEFAULT_TIMER_MINUTES = [2, 3, 5, 10] as const;

export function isValidDuration(sec: number): boolean {
  return Number.isInteger(sec) && sec >= TIMER_LIMITS.durationSec.min && sec <= TIMER_LIMITS.durationSec.max;
}

/** The duration in words: "45 seconds", "1 minute", "2 minutes 30 seconds", "1 hour 30 minutes". */
export function durationWords(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const part = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
  const parts: string[] = [];
  if (h) parts.push(part(h, 'hour'));
  if (m) parts.push(part(m, 'minute'));
  if (s || parts.length === 0) parts.push(part(s, 'second'));
  return parts.join(' ');
}

/** How a timer is referred to (run screen, delete dialog): its duration in words. */
export function timerTitle(t: Pick<PresetTimer, 'durationSec'>): string {
  return durationWords(t.durationSec);
}

/** Timers sorted from short to long. */
export function sortTimers<T extends Pick<PresetTimer, 'durationSec'>>(timers: readonly T[]): T[] {
  return [...timers].sort((a, b) => a.durationSec - b.durationSec);
}

export function createTimer(durationSec: number, now = new Date()): PresetTimer {
  const iso = now.toISOString();
  return { id: newId(), durationSec, createdAt: iso, updatedAt: iso };
}

export function defaultTimers(): PresetTimer[] {
  return DEFAULT_TIMER_MINUTES.map((m) => createTimer(m * 60));
}

/** Coerces unknown JSON into a valid timer, or null if it isn't one. */
export function sanitizeTimer(value: unknown): PresetTimer | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.durationSec !== 'number' || !isValidDuration(v.durationSec)) return null;
  const now = new Date().toISOString();
  return {
    id: typeof v.id === 'string' && v.id ? v.id : newId(),
    durationSec: v.durationSec,
    createdAt: typeof v.createdAt === 'string' ? v.createdAt : now,
    updatedAt: typeof v.updatedAt === 'string' ? v.updatedAt : now,
  };
}
