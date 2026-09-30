# yFit Workout Timer

An interval-training stopwatch for trainers. Create named routines (work / rest / rounds / cycles), then run them with huge, easy-to-read digits and countdown beeps.

The full product spec is in [SPEC.md](SPEC.md). The same app runs in two ways:

- **Mac app** (Phase 2): a native macOS app built with [Tauri](https://tauri.app).
- **Web version** (Phase 1): runs in any desktop browser.

## Install the Mac app

Works on **Apple Silicon (M1–M4) and Intel Macs**, **macOS 10.15 Catalina or newer**.

1. Download the latest **`yFit-Workout-Timer-…-mac.dmg`** from the [Releases page](../../releases/latest). You can copy the `.dmg` to another Mac with a USB stick, AirDrop or email.
2. Open the `.dmg` and drag **yFit Workout Timer** onto **Applications**.
3. Open it from **Applications**. The app isn't from the App Store, so macOS blocks it the first time:
   - **macOS 15 Sequoia or newer:** click **Done**, open **System Settings → Privacy & Security**, scroll down, click **Open Anyway** next to "yFit Workout Timer" and confirm.
   - **macOS 14 or older:** right-click (Control-click) the app → **Open** → **Open**.
4. After that it opens normally.

> **Upgrading from "yFit Tabata Timer"?** The app was renamed. After installing **yFit Workout Timer**, drag the old **yFit Tabata Timer** from Applications to the Trash. Your routines and settings carry over automatically.

If macOS says the app **"is damaged"**, run this once in Terminal:

```bash
xattr -dr com.apple.quarantine "/Applications/yFit Workout Timer.app"
```

In the Mac app, routines and settings are saved in `~/Library/Application Support/com.yfit.tabatatimer/store.json`. The display stays awake while a routine runs, and App Nap is disabled so timing and beeps stay accurate in the background.

### How the Mac app is built

A Mac app can only be built on a Mac, so GitHub builds it: the [Mac app workflow](.github/workflows/mac-app.yml) runs on a GitHub-hosted Mac, builds one **universal** `.dmg` (Apple Silicon + Intel), and publishes it as a GitHub Release. It runs **only when requested**: from the **Actions** tab choose **Mac app → Run workflow**.

To build on your own Mac instead (needs Node.js 20+ and [Rust](https://rustup.rs)):

```bash
npm install
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm run mac:build   # → src-tauri/target/universal-apple-darwin/release/bundle/dmg/
npm run mac:dev     # run the Mac app in development mode
```

## Web version

### Run it

Requires Node.js 20+.

```bash
npm install
npm run dev          # http://localhost:5173
```

Open http://localhost:5173 in Chrome or Safari.

**Speed flag (dev only):** open http://localhost:5173/?speed=10 to make time run 10× faster. This is handy for trying a whole routine in seconds. Production builds ignore it.

#### Production build

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
- **Settings** tab: separate volumes (with Test buttons) for the work beeps and the rest beeps, which use a different sound, mute, work color for the counter (default green; rest is always red) and digit size, and reset to defaults.

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
  platform/native.ts   Mac app bridge: file storage, keep-awake, native fullscreen
  main.ts              Entry point
public/sw.js           Service worker for offline use (web version only)
src-tauri/             Mac app (Tauri): Rust side, config, icons, Info.plist
assets/app-icon.png    Source for the app icons (`npx tauri icon assets/app-icon.png`)
.github/workflows/     Builds the Mac .dmg on GitHub
e2e/                   Playwright tests
```

`timer/engine.ts` has no DOM or audio code, and all persistence goes through the `AppStorage` interface. That keeps it simple to wrap the app with Tauri in Phase 2 and to swap `localStorage` for a file.
