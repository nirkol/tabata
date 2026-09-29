# Tabata Timer

An interval-training stopwatch for trainers. Create named routines (work / rest / intervals / sets), then run them with huge, easy-to-read digits and countdown beeps.

The full product spec is in [SPEC.md](SPEC.md). This repository currently contains **Phase 1: the web simulation**, a frontend-only app that runs in the browser. Phase 2 (the macOS app built with Tauri) comes later.

## Run it

Requires Node.js 20+.

```bash
npm install
npm run dev          # http://localhost:5173
```

Open http://localhost:5173 in Chrome or Safari.

**Speed flag (dev only):** open http://localhost:5173/?speed=10 to make time run 10× faster. This is handy for trying a whole routine in seconds. Production builds ignore it.

### Production build

```bash
npm run build        # outputs static files to dist/
npm run preview      # serves dist/ on http://localhost:4173
```

The build is fully static and works offline after the first visit, thanks to a service worker.

## Tests

```bash
npm test             # unit tests (Vitest): engine, beeps, validation, storage, number input
npm run test:e2e     # browser tests (Playwright, Chromium)
npm run typecheck
```

## How to use

- **Routines** tab: start, edit or delete routines. Press **Enter** to start the highlighted routine (the one used last).
- **Run screen:** **Space** pauses and resumes, **Esc** stops (after a confirmation), and **F** toggles fullscreen.
- **Settings** tab: beep volume and a test beep, mute, counter digit color (red is reserved for the last 5 seconds) and size, and reset to defaults.

## How the timing works

- The timer never counts ticks. Every value on screen comes from `performance.now()` timestamps, so it stays correct even when the browser throttles a background tab. It catches up the moment you come back.
- Beeps are generated with the Web Audio API and scheduled ahead of time on the audio clock, up to 10 minutes ahead. The audio clock isn't throttled in background tabs, so beeps stay on time when the window isn't focused.
- While a routine runs, the app asks for a Screen Wake Lock so the display doesn't go to sleep.

## Project structure

```
src/
  timer/engine.ts      Pure timer state machine: phase sequence, totals, beep schedule
  timer/format.ts      m:ss formatting and parsing
  routines/model.ts    Routine type, limits, validation, default names
  audio/beeper.ts      Web Audio beep scheduling, volume, mute
  storage/storage.ts   Persistence interface + localStorage implementation
  ui/                  Screens (list, editor, run, settings) and the − / + number control
  main.ts              Entry point
public/sw.js           Service worker for offline use
e2e/                   Playwright tests
```

`timer/engine.ts` has no DOM or audio code, and all persistence goes through the `AppStorage` interface. That keeps it simple to wrap the app with Tauri in Phase 2 and to swap `localStorage` for a file.
