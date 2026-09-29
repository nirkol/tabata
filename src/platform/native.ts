import type { KeyValueStore } from '../storage/storage';

/**
 * Bridges to the Mac app (Tauri, SPEC §9). In the browser every function falls back
 * to the web behavior, so the same UI code runs in both.
 */

/** True when running inside the Tauri Mac app. */
export function isNative(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const core = await import('@tauri-apps/api/core');
  return core.invoke<T>(cmd, args);
}

/**
 * Mac app storage: a JSON file in the app's data folder. It's read once at startup;
 * every change updates memory right away and is written to disk in order.
 */
export async function createNativeStore(): Promise<KeyValueStore> {
  let data: Record<string, string> = {};
  try {
    const parsed: unknown = JSON.parse(await invoke<string>('load_store'));
    if (parsed && typeof parsed === 'object') {
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === 'string') data[k] = v;
      }
    }
  } catch {
    data = {};
  }
  let writing: Promise<void> = Promise.resolve();
  const persist = () => {
    const snapshot = JSON.stringify(data);
    writing = writing.then(() => invoke<void>('save_store', { data: snapshot })).catch(() => undefined);
  };
  return {
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value;
      persist();
    },
    removeItem: (key) => {
      delete data[key];
      persist();
    },
  };
}

/** Keeps the display awake (Mac app); returns false when not available. */
export async function setNativeKeepAwake(on: boolean): Promise<boolean> {
  if (!isNative()) return false;
  try {
    await invoke<void>('set_keep_awake', { on });
    return true;
  } catch {
    return false;
  }
}

/** Toggles fullscreen: the native window in the Mac app, the page in the browser. */
export async function toggleFullscreen(): Promise<void> {
  if (isNative()) {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const win = getCurrentWindow();
    await win.setFullscreen(!(await win.isFullscreen()));
    return;
  }
  if (document.fullscreenElement) await document.exitFullscreen?.();
  else await document.documentElement.requestFullscreen?.();
}
