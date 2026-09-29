import { BEEP_STYLES, type BeepStyle } from '../audio/beeper';
import { isValidRoutine, newId, sampleRoutine, type Routine } from '../routines/model';

export interface Settings {
  /** Work beep volume, 0–1. */
  volume: number;
  /** Rest beep volume (Get Ready, Rest, Set Rest countdowns), 0–1. */
  restVolume: number;
  workStyle: BeepStyle;
  restStyle: BeepStyle;
  /** Show "Set remaining" and "Total remaining" on the Run screen. */
  showRemaining: boolean;
  muted: boolean;
  digitColor: string;
  /** Digit height, % of window height (10–60). */
  digitSizePct: number;
}

export const DEFAULT_SETTINGS: Settings = {
  volume: 0.7,
  restVolume: 0.7,
  workStyle: 'bell',
  restStyle: 'soft',
  showRemaining: true,
  muted: false,
  digitColor: '#30D158',
  digitSizePct: 40,
};

export const SETTINGS_LIMITS = {
  volumePct: { min: 0, max: 100 },
  digitSizePct: { min: 10, max: 60 },
} as const;

/** Persistence interface (SPEC §7). Phase 2 can swap in a file-based implementation. */
export interface AppStorage {
  loadRoutines(): Routine[];
  saveRoutines(routines: Routine[]): void;
  loadSettings(): Settings;
  saveSettings(settings: Settings): void;
  loadLastUsedId(): string | null;
  saveLastUsedId(id: string | null): void;
}

/** Minimal key/value interface satisfied by `window.localStorage`. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const KEYS = {
  routines: 'tabata.v1.routines',
  settings: 'tabata.v1.settings',
  lastUsed: 'tabata.v1.lastUsed',
} as const;

export const DATA_VERSION = 1;

/** Coerces unknown JSON into a valid routine, or null if it isn't one. */
export function sanitizeRoutine(value: unknown): Routine | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const num = (x: unknown) => (typeof x === 'number' && Number.isInteger(x) ? x : NaN);
  const fields = {
    name: typeof v.name === 'string' ? v.name.trim() : '',
    workSec: num(v.workSec),
    restSec: num(v.restSec),
    intervals: num(v.intervals),
    sets: num(v.sets),
    // Older or hand-written files may leave it out; it only matters with 2+ sets.
    setRestSec: v.setRestSec === undefined ? 60 : num(v.setRestSec),
  };
  if (fields.sets === 1 && !(fields.setRestSec >= 1 && fields.setRestSec <= 300)) fields.setRestSec = 60;
  if (!isValidRoutine(fields)) return null;
  const now = new Date().toISOString();
  return {
    id: typeof v.id === 'string' && v.id ? v.id : newId(),
    ...fields,
    createdAt: typeof v.createdAt === 'string' ? v.createdAt : now,
    updatedAt: typeof v.updatedAt === 'string' ? v.updatedAt : now,
  };
}

export function sanitizeSettings(value: unknown): Settings {
  const s = { ...DEFAULT_SETTINGS };
  if (!value || typeof value !== 'object') return s;
  const v = value as Record<string, unknown>;
  if (typeof v.volume === 'number' && v.volume >= 0 && v.volume <= 1) s.volume = v.volume;
  if (typeof v.restVolume === 'number' && v.restVolume >= 0 && v.restVolume <= 1) s.restVolume = v.restVolume;
  const isStyle = (x: unknown): x is BeepStyle => typeof x === 'string' && (BEEP_STYLES as readonly string[]).includes(x);
  if (isStyle(v.workStyle)) s.workStyle = v.workStyle;
  if (isStyle(v.restStyle)) s.restStyle = v.restStyle;
  if (typeof v.showRemaining === 'boolean') s.showRemaining = v.showRemaining;
  if (typeof v.muted === 'boolean') s.muted = v.muted;
  if (typeof v.digitColor === 'string' && /^#[0-9a-f]{6}$/i.test(v.digitColor) && !isReddish(v.digitColor)) {
    s.digitColor = v.digitColor.toUpperCase();
  }
  if (
    typeof v.digitSizePct === 'number' &&
    v.digitSizePct >= SETTINGS_LIMITS.digitSizePct.min &&
    v.digitSizePct <= SETTINGS_LIMITS.digitSizePct.max
  ) {
    s.digitSizePct = v.digitSizePct;
  }
  return s;
}

/**
 * True for colors that would be confused with the red rest color (SPEC §6):
 * a saturated, mid-lightness color with a hue within ±20° of pure red.
 */
export function isReddish(hex: string): boolean {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return false;
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => parseInt(x, 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return false;
  const sat = d / (1 - Math.abs(2 * l - 1));
  let hue: number;
  if (max === r) hue = (((g - b) / d) % 6) * 60;
  else if (max === g) hue = ((b - r) / d + 2) * 60;
  else hue = ((r - g) / d + 4) * 60;
  if (hue < 0) hue += 360;
  const redHue = hue <= 20 || hue >= 340;
  return redHue && sat >= 0.5 && l >= 0.25 && l <= 0.75;
}

function readJson(store: KeyValueStore, key: string): unknown {
  try {
    const raw = store.getItem(key);
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export class LocalAppStorage implements AppStorage {
  constructor(private readonly store: KeyValueStore) {}

  loadRoutines(): Routine[] {
    const data = readJson(this.store, KEYS.routines) as { version?: number; routines?: unknown } | undefined;
    if (data === undefined) {
      // First launch: create the sample routine (SPEC §5.1).
      const routines = [sampleRoutine()];
      this.saveRoutines(routines);
      return routines;
    }
    const list = Array.isArray(data?.routines) ? data.routines : [];
    return list.map(sanitizeRoutine).filter((r): r is Routine => r !== null);
  }

  saveRoutines(routines: Routine[]): void {
    this.store.setItem(KEYS.routines, JSON.stringify({ version: DATA_VERSION, routines }));
  }

  loadSettings(): Settings {
    const data = readJson(this.store, KEYS.settings) as { settings?: unknown } | undefined;
    return sanitizeSettings(data?.settings);
  }

  saveSettings(settings: Settings): void {
    this.store.setItem(KEYS.settings, JSON.stringify({ version: DATA_VERSION, settings }));
  }

  loadLastUsedId(): string | null {
    try {
      return this.store.getItem(KEYS.lastUsed);
    } catch {
      return null;
    }
  }

  saveLastUsedId(id: string | null): void {
    if (id === null) this.store.removeItem(KEYS.lastUsed);
    else this.store.setItem(KEYS.lastUsed, id);
  }
}
