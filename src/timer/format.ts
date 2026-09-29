/** Formats whole seconds as m:ss, or h:mm:ss from one hour up. */
export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/**
 * Formats a countdown given in milliseconds. Rounds up so the display shows
 * 0:05 for the whole last-but-four second and reaches 0:00 only at the end.
 */
export function formatCountdown(remainingMs: number): string {
  return formatClock(Math.ceil(Math.max(0, remainingMs) / 1000 - 1e-9));
}

/**
 * Parses a typed time: "m:ss" (e.g. "1:30") or plain seconds (e.g. "90").
 * Returns null for anything else.
 */
export function parseTime(text: string): number | null {
  const t = text.trim();
  if (/^\d{1,4}$/.test(t)) return Number(t);
  const m = /^(\d{1,3}):(\d{1,2})$/.exec(t);
  if (!m) return null;
  const secs = Number(m[2]);
  if (secs >= 60) return null;
  return Number(m[1]) * 60 + secs;
}

/** Parses a typed whole number. Returns null for anything else. */
export function parseInteger(text: string): number | null {
  const t = text.trim();
  return /^\d{1,6}$/.test(t) ? Number(t) : null;
}
