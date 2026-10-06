import { BEEP_STYLES, type BeepStyle } from '../audio/beeper';
import { isValidRoutine, newId, sampleRoutine, type Routine } from '../routines/model';
import { defaultTimers, sanitizeTimer, type PresetTimer } from '../timers/model';

export interface Settings {
  /** Work beep volume, 0–1. */
  volume: number;
  /** Rest beep volume (Get Ready, Rest, Set Rest countdowns), 0–1. */
  restVolume: number;
  workStyle: BeepStyle;
  restStyle: BeepStyle;
  /** Show "Set remaining" and "Total remaining" on the Run screen. */
  showRemaining: boolean;
  /** Spoken "Ten!" 10 s before the end of each Work period. */
  tenCall: boolean;
  /** Spoken "Start!" at the start of each Work period. */
  startCall: boolean;
  /** Spoken encouragement at the end of each cycle, picked at random from `praises`. */
  praiseCall: boolean;
  /** Up to 10 encouraging statements (empty ones are skipped). */
  praises: string[];
  muted: boolean;
  digitColor: string;
  /** Digit height, % of window height (10–60). */
  digitSizePct: number;
}

/** Encouraging statements spoken at the end of a cycle (editable in Settings). */
export const DEFAULT_PRAISES: readonly string[] = [
  'Great job!',
  'You did it!',
  'Well done!',
  'Way to go!',
  "You're the best!",
  'Wooow whooo!',
  'That was great!',
  'yFit rocks!',
  'Be your best!',
  'Make it happen!',
];
export const PRAISE_COUNT = 10;
export const PRAISE_MAX_LENGTH = 60;

/**
 * Picks a random statement, skipping empty ones and (when possible) the one used last time.
 * Returns null if every statement is empty.
 */
export function pickPraise(praises: readonly string[], previous: string | null, random: () => number = Math.random): string | null {
  const options = praises.map((p) => p.trim()).filter((p) => p.length > 0);
  if (options.length === 0) return null;
  const fresh = options.length > 1 ? options.filter((p) => p !== previous) : options;
  return fresh[Math.floor(random() * fresh.length) % fresh.length];
}

export const DEFAULT_SETTINGS: Settings = {
  volume: 0.7,
  restVolume: 0.7,
  workStyle: 'bell',
  restStyle: 'soft',
  showRemaining: true,
  tenCall: true,
  startCall: true,
  praiseCall: true,
  praises: [...DEFAULT_PRAISES],
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
  loadTimers(): PresetTimer[];
  saveTimers(timers: PresetTimer[]): void;
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
  timers: 'tabata.v1.timers',
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
  const s = { ...DEFAULT_SETTINGS, praises: [...DEFAULT_SETTINGS.praises] };
  if (!value || typeof value !== 'object') return s;
  const v = value as Record<string, unknown>;
  if (typeof v.volume === 'number' && v.volume >= 0 && v.volume <= 1) s.volume = v.volume;
  if (typeof v.restVolume === 'number' && v.restVolume >= 0 && v.restVolume <= 1) s.restVolume = v.restVolume;
  const isStyle = (x: unknown): x is BeepStyle => typeof x === 'string' && (BEEP_STYLES as readonly string[]).includes(x);
  if (isStyle(v.workStyle)) s.workStyle = v.workStyle;
  if (isStyle(v.restStyle)) s.restStyle = v.restStyle;
  if (typeof v.showRemaining === 'boolean') s.showRemaining = v.showRemaining;
  if (typeof v.tenCall === 'boolean') s.tenCall = v.tenCall;
  if (typeof v.startCall === 'boolean') s.startCall = v.startCall;
  if (typeof v.praiseCall === 'boolean') s.praiseCall = v.praiseCall;
  if (Array.isArray(v.praises)) {
    const list = v.praises.slice(0, PRAISE_COUNT).map((x) => (typeof x === 'string' ? x.slice(0, PRAISE_MAX_LENGTH) : ''));
    while (list.length < PRAISE_COUNT) list.push('');
    s.praises = list;
  }
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

  loadTimers(): PresetTimer[] {
    const data = readJson(this.store, KEYS.timers) as { version?: number; timers?: unknown } | undefined;
    if (data === undefined) {
      // First use: 1, 2, 5 and 10 minute presets (SPEC §5b).
      const timers = defaultTimers();
      this.saveTimers(timers);
      return timers;
    }
    const list = Array.isArray(data?.timers) ? data.timers : [];
    return list.map(sanitizeTimer).filter((t): t is PresetTimer => t !== null);
  }

  saveTimers(timers: PresetTimer[]): void {
    this.store.setItem(KEYS.timers, JSON.stringify({ version: DATA_VERSION, timers }));
  }
}
