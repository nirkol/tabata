/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the build works from any folder (and inside Tauri later).
  base: './',
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
