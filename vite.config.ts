/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import tauriConf from './src-tauri/tauri.conf.json';

// One version number for the app: the Mac app's version (also shown on the About page).
const appVersion: string = tauriConf.version;

export default defineConfig({
  // Relative asset paths so the build works from any folder (and inside Tauri later).
  base: './',
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  // Old Macs (macOS 10.15 Catalina) run the app in an older WebKit (Safari 13/14):
  // compile modern syntax down so it still runs there.
  build: { target: ['es2019', 'safari13'] },
  // Tauri: keep the dev server predictable and don't clear its console output.
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
