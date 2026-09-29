import '@fontsource/barlow-condensed/latin-700.css';
import './styles.css';
import { LocalAppStorage } from './storage/storage';
import { App } from './ui/app';

/** Dev-only speed flag, e.g. `?speed=10` (SPEC §8). Always 1 in production builds. */
function readSpeed(): number {
  if (!import.meta.env.DEV) return 1;
  const value = Number(new URLSearchParams(location.search).get('speed'));
  return Number.isFinite(value) && value > 0 && value <= 1000 ? value : 1;
}

const app = new App(document.getElementById('app')!, new LocalAppStorage(window.localStorage), readSpeed());
app.go({ name: 'list' });

// Offline support for the web build. Skipped in dev and when not served over http(s) (e.g. inside Tauri).
if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}
