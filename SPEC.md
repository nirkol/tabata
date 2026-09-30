# yFit Workout Timer: Product Spec

> **Status:** v1.0, ready for implementation. All open questions are resolved (see the decision log in §12).
> **Audience:** Claude Code, which will implement this spec.

---

## 1. Overview

A Tabata / interval-training stopwatch for a trainer. The trainer creates and saves named routines, runs them with a large, easy-to-read countdown, and hears beeps near the end of every phase.

Delivery happens in two phases:

| Phase | Deliverable | Notes |
|---|---|---|
| **1. Web simulation** | Frontend-only web app that runs in a desktop browser (Chrome, Safari) | No backend. All data is stored in the browser. |
| **2. macOS app** | Installable `.dmg` built with **Tauri** from the **same** frontend code | Starts only after Phase 1 is approved. See §9. |

Phase 1 must be built so it can be wrapped with Tauri later without a rewrite (see §8).

---

## 2. Glossary

| Term | Meaning |
|---|---|
| **Work** | The training period. |
| **Rest** | The rest period after each work period. |
| **Round** | One Work + one Rest. |
| **Cycle** | A block of *N* rounds. A routine repeats its block of rounds for a number of cycles. |
| **Routine** | A saved, named configuration of all of the above. |
| **Phase** | The current state of the timer: `Get Ready`, `Work`, `Rest`, `Cycle Rest`, `Done`. |

---

## 3. Routine definition

| Field | Type | Range | Default | Notes |
|---|---|---|---|---|
| Name | text | 1–40 chars | `Routine N` | N is the next free number: `Routine 1`, `Routine 2`, … |
| Work time | seconds | 1 s – 600 s (10 min) | 20 s | Entered as mm:ss |
| Rest time | seconds | 0 s – 180 s (3 min) | 10 s | Entered as mm:ss. **0 = no rest**: the next Work starts right away (the 0 s Rest phase is skipped). |
| Rounds | integer | 1 – 20 | 8 | Number of Work+Rest pairs in one cycle |
| Cycles | integer | 1 – 10 | 1 | Number of times the whole block of rounds runs |
| Rest between cycles | seconds | 1 s – 300 s (5 min) | 60 s | Recovery between two cycles. Entered as mm:ss. Disabled (grayed out) when Cycles = 1, because there is no gap to fill. |

The defaults (20 s / 10 s / 8 rounds) are the classic Tabata protocol.

**Get Ready** is a fixed **5-second** countdown before the first Work period of every run. It is not configurable, and it has the same red digits and beeps as any other phase (§4.3, §4.4).

### 3.1 Phase sequence rules
1. Every run starts with **Get Ready (5 s)**.
2. Each cycle runs `Work → Rest`, *Rounds* times.
3. **Between cycles:** the last Rest of every cycle except the final one is **replaced** by *Rest between cycles*. It is not added on top of the normal Rest.
4. The **last Rest of the last cycle is skipped**, so the routine ends right after the final Work period.
5. Then the timer enters **Done**.

Example: Work 20 s, Rest 10 s, 3 rounds, 2 cycles, Rest between cycles 60 s:

```
GetReady(5)
Cycle 1:  W20 R10 W20 R10 W20 CycleRest(60)
Cycle 2:  W20 R10 W20 R10 W20 → Done
```

With Cycles = 1, there is no Cycle Rest:

```
GetReady(5) → W20 R10 W20 R10 W20 → Done
```

### 3.2 Derived values (shown in the editor)
- **Total routine duration**, including Get Ready, for example "Total: 4:05".

---

## 4. Timer screen (the "Run" view)

This screen is used mid-workout, often from several meters away, so readability matters more than anything else.

### 4.1 Layout (desktop, landscape)

```
┌───────────────────────────────────────────────────────────┐
│  Routine: "Morning HIIT"          🔊 ━━━●━━ 70%   ⛶      │
│                                                           │
│                        WORK                               │  ← phase label
│                  ╭───────────────╮                        │
│                  │               │                        │
│                  │     0:17      │  ← HUGE digits         │
│                  │               │                        │
│                  ╰───────────────╯  ← progress ring       │
│                                                           │
│  Cycle 1 / 2 │ Work 0:20 │ Rest 0:10 │ Rounds left: 5 / 8 │
│                                                           │
│ Next: REST 0:10   Cycle remaining: 2:05 │ Total remaining: 6:42 │
│                                                           │
│              [ ⏯ PAUSE ]            [ ■ STOP ]            │
└───────────────────────────────────────────────────────────┘
```

### 4.1a Workout timeline
A thin bar across the top of the Run screen shows the **whole workout plan** as one segment per phase, sized by its duration: **Work** in the work color (default green), **Get Ready, Rest and Rest between cycles** in red. The finished part is shown bright and the rest dimmed, and a white marker shows the current position. It moves smoothly and freezes while paused.

### 4.2 Required display elements
1. **Countdown for the current phase** in very large digits, formatted `m:ss` (for example `0:17`, `2:30`).
2. **Phase label**: GET READY / WORK / REST / CYCLE REST / DONE, in large capital letters.
3. **Current cycle and the Work and Rest durations** of the routine, in one row: `Cycle 1 / 2 │ Work 0:20 │ Rest 0:10 │ Rounds left: 5 / 8`.
4. **Rounds remaining** in the current cycle, for example `5 / 8`.
5. **Current cycle**, for example `Cycle 1 / 2`, shown once, at the start of the Work/Rest row (not in the top corner).
6. **Next phase** preview, for example "Next: REST 0:10".
7. **Cycle remaining**: time left in the current cycle. A cycle runs from its first Work period until the next cycle starts, so it includes the Rest between cycles. During Get Ready it shows the full length of cycle 1.
8. **Total time remaining** for the whole routine.

The bottom row shows the Next phase on the left, and Cycle remaining next to Total remaining in the center.

The top-right corner has the **volume controls**: a mute button, then two volume sliders stacked on top of each other, labeled **Work volume** (top) and **Rest volume** (beneath it), each 0–100 % in 5 % steps with its current value, and the fullscreen button. Changes apply immediately and are saved to Settings. Moving the slider above 0 % while muted unmutes.

### 4.3 Colors and progress indicator
- **Color by phase:** during **Work** the digits and ring use the **work color** chosen in Settings (default **green**). During **Rest, Cycle Rest and Get Ready** they are always **red**. The color stays the same for the whole phase; the last 5 seconds are announced by the beeps.
- The progress indicator is a ring around the digits that empties as the phase elapses. It animates smoothly and does not jump once per second.

### 4.4 Audio cues
Every phase (Get Ready, Work, Rest, Cycle Rest) ends with the same **5-beep countdown**:

| Remaining time | Sound |
|---|---|
| 4 s, 3 s, 2 s, 1 s | Short beep (~150 ms) |
| 0 s (phase changes) | **Long beep** (~600 ms). This is the 5th beep, and it marks the moment the next phase starts. |
| End of routine | A distinct "finished" sound (three long beeps) instead of the single long beep |

- The beeps start at the moment the digits turn red (the last 5 seconds) and fall exactly on the second boundaries.
- If a phase is shorter than 5 s, only the beeps that fit inside it are played, plus the long beep at 0.
- **Two beep sounds:** countdowns that end a **Work** period use the *work sound*: a short woody "tock" for the countdown beeps and a boxing-ring bell strike for the long beep, so it sounds like a gym timer rather than a medical monitor. Countdowns that end **Get Ready, Rest or Rest between cycles** (the ones that lead into Work) use a different *rest sound* (lower, softer). The final "finished" sound is three bell strikes. Each sound has its own volume (§6).
- Beeps are **generated** with the Web Audio API (oscillator), not audio files. This keeps timing sample-accurate.
- Volumes come from Settings (§6).

### 4.5 Controls
| Control | Behavior | Keyboard |
|---|---|---|
| **Start** (on the routine list) | Starts the routine with the 5 s Get Ready | `Enter` |
| **Pause / Resume** | Freezes the countdown and all sound. Resume continues from the exact remaining time. | `Space` |
| **Stop** | Ends the run and returns to the routine list, after an "Are you sure?" confirmation. If the routine is running, Stop **pauses it while asking**; choosing Cancel resumes it from the same second, so a routine can't be stopped by accident. | `Esc` |
| Fullscreen | Toggles fullscreen | `F` |

- The Run screen has **only Pause and Stop**. There are no Skip or Restart-phase buttons.
- When the routine finishes (DONE), Pause is hidden and two buttons are shown: **↻ Start over** (runs the same routine again from Get Ready) and **← Back to routines**.
- The buttons must be large (at least 64 px tall), because the trainer may click them with sweaty hands.

### 4.6 Background behavior (critical)
The countdown **and the beeps must keep running** when the window or tab is not focused, is minimized, or is behind another app.

Implementation requirements:
- **Never compute time by counting `setInterval` ticks.** Browsers throttle timers in background tabs to 1 per second or less. Remaining time is always computed as `endTimestamp - performance.now()`.
- **Schedule beeps ahead of time on the Web Audio clock.** At phase start, or on resume, schedule the whole remaining sequence of beeps, or at least the next few phases, with `audioContext.currentTime + offset`. The audio clock is not throttled in background tabs. On Pause, cancel the scheduled beeps; on Resume, schedule them again.
- Because background timers may be delayed, phase advancement must also be computed from timestamps. When the tab comes back into focus, the engine immediately catches up to the correct phase.
- The `AudioContext` is created or resumed on the first user click (the Start button), because browsers block autoplay otherwise.
- Request a **Screen Wake Lock** while running, so the display doesn't sleep mid-workout.
- Show the remaining time and phase in the **browser tab title**, for example `0:17 WORK – yFit Workout Timer`.

---

## 5. Routines screen (list and editor)

### 5.1 List
- Shows all saved routines as cards with the name and **labeled** values, so it's clear which number is which: `WORK 0:20 · REST 0:10 · ROUNDS 8 · CYCLES 2 · REST BETWEEN CYCLES 1:00 · TOTAL 8:45`. Rest between cycles is shown only when there are 2+ cycles.
- Each card has **Start**, **Edit** (pencil icon) and **Delete** (trash icon) buttons (no Duplicate).
- **Delete** asks for confirmation.
- A **"+ New Routine"** button opens the editor, prefilled with the defaults and the next free `Routine N` name.
- On first launch, the app creates one sample routine: "Classic Tabata" (20/10 × 8 × 1).
- The last-used routine is highlighted (blue edge and a "LAST USED" tag).
- Visual style: premium dark cards with soft depth and a hover lift; values in the display font with thin dividers; the total in accent blue; **Start** is the prominent button while Edit and Delete are quiet (Delete turns red on hover); the header shows the number of routines.
- **Reorder routines:** each card has a ☰ drag handle on its right edge. Drag it with the mouse to move the routine up or down (the list scrolls when dragging near its top or bottom edge), or focus the handle and press ↑ / ↓. The new order is saved.
  - While dragging, the card lifts, follows the pointer and is shifted ~1 cm to the right; a dashed **“Drop here”** slot marks where it will land, the other cards slide out of the way, and on release the card glides into the slot. Keyboard moves are animated too. (No animation when the system asks for reduced motion.)
- **Edit** and **Delete** are icon buttons (pencil and trash) with tooltips.
- **Long lists scroll:** only the routine cards scroll (with an always-visible scrollbar); the top bar, the "Routines" title and "+ New Routine" stay in place. The highlighted routine is scrolled into view when the list opens, and the scroll position is kept when a card is selected.

### 5.2 Editor
- Contains every field from §3, with validation that enforces the ranges. Invalid input shows an inline error and disables Save.
- A live "Total duration" preview is shown.
- Compact two-column layout: Name across the top, then Work | Rest, Rounds | Cycles, Rest between cycles | Total, then Save / Cancel.
- **Routine names are right-to-left by default** (they are mostly Hebrew): the name field is RTL, and names are shown with automatic direction everywhere (Hebrew RTL, English LTR). A bundled bold Hebrew font (Rubik) matches the display font.
- Buttons: **Save**, **Cancel**. The editor can only be left with these: the top navigation tabs are disabled while a routine is being created or edited.
- Names do not need to be unique.

### 5.3 Number input control (used for every numeric field)
Every numeric field (Work, Rest, Rest between cycles, Rounds, Cycles, and the numeric settings in §6) uses the same control:

```
 [ − ]  [  0:20  ]  [ + ]
```

- **− / + buttons:** each click changes the value by one step. Pressing and holding the button repeats the step, and the repeat speeds up after about 1 s of holding.
  - Time fields: step = 1 s. After 2 s of holding, the step grows to 5 s.
  - Rounds / Cycles: step = 1.
- **Manual entry:** the user can click the value and type it directly.
  - Time fields accept `m:ss` (for example `1:30`) or plain seconds (for example `90`, displayed as `1:30` afterwards).
  - Pressing Enter or leaving the field confirms the value. Pressing Esc restores the previous value.
- **Limits:** the − button is disabled at the minimum value and + is disabled at the maximum. A typed value outside the range shows an inline error such as "Must be between 0:01 and 3:00", and Save stays disabled until it's fixed. Non-numeric input is rejected.
- The buttons are at least 44 × 44 px, so they are easy to click.

---

## 6. Settings (Admin)

The admin area is a plain **Settings screen with no PIN or password**. It holds routine management (§5) and the settings below.

| Setting | Control | Range | Default |
|---|---|---|---|
| Work beep volume | − / + number control (§5.3, step 5 %) + slider + **"Test"** button | 0 – 100 % | 70 % |
| Rest beep volume | Same control as the work beep volume, for the rest sound (Get Ready, Rest, Rest between cycles) | 0 – 100 % | 70 % |
| Work beep sound | Dropdown next to the work volume; plays the sound when changed | Classic beep / Soft beep / High beep / Low beep / Gym bell | Gym bell |
| Rest beep sound | Dropdown next to the rest volume; plays the sound when changed | Classic beep / Soft beep / High beep / Low beep / Gym bell | Soft beep |
| Show remaining times | Checkbox: show "Cycle remaining" and "Total remaining" on the Run screen | on / off | on |
| Work color | Color picker (with a few presets) for the digits and ring during Work | any color except red, which is reserved for rest | Green `#30D158` |
| Counter digit size | − / + number control (§5.3, step 5 %) + slider, with live preview | 10 – 60 % of window height | 40 % |
| Mute | Toggle, also available on the run screen | on / off | off |

Both beep volumes and Mute can also be changed from the Run screen (§4.2).

- The Run screen background is dark (near black) so that the digits have high contrast.
- Settings apply immediately and persist.
- A "Reset to defaults" button.
- The Settings screen is compact: each slider sits on the same row as its − / + control, the digit-size preview sits beside the color and size controls, and Reset to defaults is in the page header.

---

## 7. Data and persistence

- **Phase 1:** `localStorage`, stored under versioned keys (`tabata.v1.routines` and `tabata.v1.settings`).
- The data model is JSON and versioned:

```json
{
  "version": 1,
  "routines": [
    {
      "id": "uuid",
      "name": "Routine 1",
      "workSec": 20,
      "restSec": 10,
      "intervals": 8,
      "sets": 1,
      "setRestSec": 60,
      "createdAt": "ISO-8601",
      "updatedAt": "ISO-8601"
    }
  ],
  "settings": {
    "volume": 0.7,
    "restVolume": 0.7,
    "workStyle": "bell",
    "restStyle": "soft",
    "showRemaining": true,
    "muted": false,
    "digitColor": "#30D158",
    "digitSizePct": 40
  }
}
```

- There is no Export / Import of routines (removed by product decision).
- Storage access goes through a small `storage` module. That way Phase 2 can swap in file-based storage without touching the UI.

---

## 8. Technical approach (Phase 1)

- **Stack:** Vite + TypeScript with no UI framework (vanilla TS, since the app is small). Tauri can package it directly later.
- Frontend only, no backend, no network calls, fully offline.
- **Code structure:**
  - `timer/engine.ts`: a pure state machine that builds the phase sequence (§3.1) from a routine and exposes `start`, `pause`, `resume` and `stop`. It takes a clock as input, has **no DOM or audio code**, and is fully unit-tested.
  - `audio/beeper.ts`: Web Audio beep scheduling, volume and mute.
  - `storage/`: persistence behind an interface.
  - `ui/`: screens (Routine list, Editor, Run, Settings).
- **Tests:**
  - Unit tests (Vitest) for the engine: the phase sequence including the skipped final rest and the cycle-rest replacement, pause/resume math, total-duration calculation, and beep times.
  - Validation tests for all field ranges.
  - One Playwright smoke test: create a routine, run it, pause, resume, and finish it, using the speed flag.
- A dev-only **speed flag** (`?speed=10`) that makes time run faster, for quick manual testing.
- Supported browsers: latest Chrome and Safari on macOS.

---

## 9. Phase 2: macOS app (after the web version is approved)

- Wrap the Phase 1 frontend with **Tauri** (small app, ~10 MB, native WebKit).
- Output: a `.dmg` installer that drags the app into Applications.
- Target: **both Apple Silicon (arm64) and Intel (x86_64) Macs**. Build a single **universal binary** (`tauri build --target universal-apple-darwin`) so one `.dmg` works on both.
- Minimum macOS version: **10.15 Catalina**, the oldest version Tauri 2 supports, so older Macs (roughly 2012 and newer) can run it. The web code is compiled for the older WebKit these systems use (Safari 13+).
- **Unsigned build is acceptable.** The first launch shows a Gatekeeper warning, and the user right-clicks → Open once. The README must explain this step.
- Mac-specific needs:
  - Prevent **App Nap** or throttling while a routine is running, so timing and beeps stay accurate in the background.
  - Prevent display sleep while running.
  - Routines are stored in a JSON file in the app's data folder (`~/Library/Application Support/com.yfit.tabatatimer/store.json`) instead of `localStorage`. Routines are not carried over from the web version; they are created again in the Mac app.

---

## 10. Out of scope
- Exercise names per round
- Voice announcements
- Workout history and statistics
- User accounts, cloud sync, mobile apps
- PIN or password protection for admin

---

## 11. Acceptance criteria (Phase 1)
1. The user can create, edit and delete routines. New routines get a default name `Routine N`, and routines survive a page reload.
2. Validation enforces all ranges in §3 (rounds 1–20, cycles 1–10, work 1 s–10 min, rest 1 s–3 min, rest between cycles 1 s–5 min).
3. Every numeric field can be changed with the − / + buttons (including press-and-hold) and by typing a value, as described in §5.3.
4. A run follows exactly the phase sequence in §3.1, including the 5 s Get Ready, the rest between cycles replacing the last Rest of each cycle, and the skipped final Rest. This is verified by unit tests.
5. The countdown digits are readable from 3 m away at the default size, and the size and color settings take effect immediately.
6. During Work the digits and ring use the work color (default green); during Rest, Cycle Rest and Get Ready they are red. During the last 5 s of every phase, 4 short beeps play, and the 5th beep is long and marks the phase change.
7. Pause freezes time and sound, and Resume continues with less than 100 ms drift.
8. With the tab in the background for 60 s or more, beeps still play on time. When the user returns, the display shows the correct time and phase, and total drift over a 10-minute routine is under 250 ms.
9. The volume setting changes beep loudness, and 0 % or Mute is silent.
10. The app works offline after the first load.

---

## 12. Decision log
| Topic | Decision |
|---|---|
| "Repeats" | Renamed to **Cycles** (1–10) |
| Terminology | The app says **Cycles** (formerly "Sets") and **Rounds** (formerly "Intervals"). The stored data keeps the field names `sets`, `intervals` and `setRestSec`, so saved routines keep working. |
| Final rest | The last Rest of the last cycle is skipped |
| Get Ready | Fixed 5 s, with the same red digits and beeps as other phases |
| Max rounds | 20 |
| Rest between cycles | Configurable per routine, 1–300 s (default 60 s); replaces the last Rest of each cycle except the final cycle |
| Number inputs | − / + buttons (with press-and-hold) **and** manual typing for every numeric field |
| Beeps | 4 short beeps + 1 long 5th beep at the phase change; rest countdowns use a different sound with its own volume |
| Colors | Work in the chosen work color (default green); rest (and Get Ready) always red |
| Zero rest | Rest time may be 0 (no rest between rounds) |
| Hebrew names | Routine names are right-to-left by default |
| Admin | No PIN |
| Export / Import | Removed from Settings; routines are not moved between the web version and the Mac app |
| Routine list | No Duplicate button (Start, Edit, Delete only); ☰ handle to reorder by drag (or ↑ / ↓) |
| Run-screen info | Cycle counter only at the start of the Work/Rest row; "Cycle remaining" and "Total remaining" together in the center; volume slider + mute in the top-right corner |
| Leaving screens | Stop on the Run screen pauses the routine and asks for confirmation (Cancel resumes); the routine editor can only be left with Save or Cancel |
| Run-screen controls | Only Pause and Stop (no Skip or Restart); at the end: Start over and Back to routines |
| Mac packaging | Tauri, unsigned build accepted |
| Beep sounds | 5 selectable styles, all variations of a workout-timer beep (Classic, Soft, High, Low beep, Gym bell), chosen separately for work and rest |
| Remaining times | "Cycle remaining" / "Total remaining" can be hidden in Settings |
| App name | "yFit Workout Timer" (formerly "yFit Tabata Timer"): top-left header, window and browser tab title, Mac app and installer name. The Mac bundle identifier stays `com.yfit.tabatatimer` so saved data is kept. |
| Mac hardware | Universal binary for Apple Silicon and Intel, macOS 10.15+ (older Macs supported) |
| Mac build | Built by a GitHub Actions workflow on a GitHub-hosted Mac, **only when explicitly requested** (manual run, not on every push); the .dmg is published as a GitHub Release. Ad-hoc signed (not notarized). |
| Exercise names, voice, history | Not needed |
