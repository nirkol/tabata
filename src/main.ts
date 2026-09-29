import '@fontsource/barlow-condensed/latin-700.css';
// Hebrew letters for routine names (Barlow Condensed has none); loaded only when needed.
import '@fontsource/rubik/hebrew-700.css';
import './styles.css';
import { createNativeStore, isNative } from './platform/native';
import { LocalAppStorage } from './storage/storage';
import { App } from './ui/app';

/** Dev-only speed flag, e.g. `?speed=10` (SPEC §8). Always 1 in production builds. */
function readSpeed(): number {
  if (!import.meta.env.DEV) return 1;
  const value = Number(new URLSearchParams(location.search).get('speed'));
  return Number.isFinite(value) && value > 0 && value <= 1000 ? value : 1;
}

async function boot(): Promise<void> {
  // Mac app: a JSON file in the app's data folder. Browser: localStorage (SPEC §7, §9).
  const store = isNative() ? await createNativeStore() : window.localStorage;
  const app = new App(document.getElementById('app')!, new LocalAppStorage(store), readSpeed());
  app.go({ name: 'list' });
}
void boot();

// Offline support for the web build. Skipped in dev and when not served over http(s) (e.g. inside Tauri).
if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}
