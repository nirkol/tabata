# Tabata Timer: Product Spec

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
| **Interval** | One Work + one Rest. |
| **Set** | A block of *N* intervals. A routine repeats its block of intervals for a number of sets. |
| **Routine** | A saved, named configuration of all of the above. |
| **Phase** | The current state of the timer: `Get Ready`, `Work`, `Rest`, `Set Rest`, `Done`. |

---

## 3. Routine definition

| Field | Type | Range | Default | Notes |
|---|---|---|---|---|
| Name | text | 1–40 chars | `Routine N` | N is the next free number: `Routine 1`, `Routine 2`, … |
| Work time | seconds | 1 s – 600 s (10 min) | 20 s | Entered as mm:ss |
| Rest time | seconds | 1 s – 180 s (3 min) | 10 s | Entered as mm:ss |
| Intervals | integer | 1 – 20 | 8 | Number of Work+Rest pairs in one set |
| Sets | integer | 1 – 10 | 1 | Number of times the whole block of intervals runs |
| Rest between sets | seconds | 1 s – 300 s (5 min) | 60 s | Recovery between two sets. Entered as mm:ss. Disabled (grayed out) when Sets = 1, because there is no gap to fill. |

The defaults (20 s / 10 s / 8 intervals) are the classic Tabata protocol.

**Get Ready** is a fixed **5-second** countdown before the first Work period of every run. It is not configurable, and it has the same red digits and beeps as any other phase (§4.3, §4.4).

### 3.1 Phase sequence rules
1. Every run starts with **Get Ready (5 s)**.
2. Each set runs `Work → Rest`, *Intervals* times.
3. **Between sets:** the last Rest of every set except the final one is **replaced** by *Rest between sets*. It is not added on top of the normal Rest.
4. The **last Rest of the last set is skipped**, so the routine ends right after the final Work period.
5. Then the timer enters **Done**.

Example: Work 20 s, Rest 10 s, 3 intervals, 2 sets, Rest between sets 60 s:

```
GetReady(5)
Set 1:  W20 R10 W20 R10 W20 SetRest(60)
Set 2:  W20 R10 W20 R10 W20 → Done
```

With Sets = 1, there is no Set Rest:

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
│  Set 1 / 2 │ Work 0:20 │ Rest 0:10 │ Intervals left: 5 / 8 │
│                                                           │
│ Next: REST 0:10   Set remaining: 2:05 │ Total remaining: 6:42 │
│                                                           │
│              [ ⏯ PAUSE ]            [ ■ STOP ]            │
└───────────────────────────────────────────────────────────┘
```

### 4.2 Required display elements
1. **Countdown for the current phase** in very large digits, formatted `m:ss` (for example `0:17`, `2:30`).
2. **Phase label**: GET READY / WORK / REST / SET REST / DONE, in large capital letters.
3. **Current set and the Work and Rest durations** of the routine, in one row: `Set 1 / 2 │ Work 0:20 │ Rest 0:10 │ Intervals left: 5 / 8`.
4. **Intervals remaining** in the current set, for example `5 / 8`.
5. **Current set**, for example `Set 1 / 2`, shown once, at the start of the Work/Rest row (not in the top corner).
6. **Next phase** preview, for example "Next: REST 0:10".
7. **Set remaining**: time left in the current set. A set runs from its first Work period until the next set starts, so it includes the Rest between sets. During Get Ready it shows the full length of set 1.
8. **Total time remaining** for the whole routine.

The bottom row shows the Next phase on the left, and Set remaining next to Total remaining in the center.

The top-right corner has the **volume control**: a mute button, a volume slider (0–100 %, step 5 %) with the current value, and the fullscreen button. Changes apply immediately and are saved to Settings. Moving the slider above 0 % while muted unmutes.

### 4.3 Colors and progress indicator
- **Every phase uses the same color.** The digit color is the one chosen in Settings (§6). The background and the other elements do not change color between Work, Rest, Set Rest or Get Ready. The phase label text is what tells the phases apart.
- **In the last 5 seconds of any phase**, the digits **and** the progress indicator turn **red**. They return to the normal color when the next phase starts.
- The progress indicator is a ring around the digits that empties as the phase elapses. It animates smoothly and does not jump once per second.

### 4.4 Audio cues
Every phase (Get Ready, Work, Rest, Set Rest) ends with the same **5-beep countdown**:

| Remaining time | Sound |
|---|---|
| 4 s, 3 s, 2 s, 1 s | Short beep (~150 ms) |
| 0 s (phase changes) | **Long beep** (~600 ms). This is the 5th beep, and it marks the moment the next phase starts. |
| End of routine | A distinct "finished" sound (three long beeps) instead of the single long beep |

- The beeps start at the moment the digits turn red (the last 5 seconds) and fall exactly on the second boundaries.
- If a phase is shorter than 5 s, only the beeps that fit inside it are played, plus the long beep at 0.
- Beeps are **generated** with the Web Audio API (oscillator), not audio files. This keeps timing sample-accurate.
- Volume comes from Settings (§6).

### 4.5 Controls
| Control | Behavior | Keyboard |
|---|---|---|
| **Start** (on the routine list) | Starts the routine with the 5 s Get Ready | `Enter` |
| **Pause / Resume** | Freezes the countdown and all sound. Resume continues from the exact remaining time. | `Space` |
| **Stop** | Ends the run and returns to the routine list, after an "Are you sure?" confirmation | `Esc` |
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
- Show the remaining time and phase in the **browser tab title**, for example `0:17 WORK – Tabata`.

---

## 5. Routines screen (list and editor)

### 5.1 List
- Shows all saved routines as cards with the name and **labeled** values, so it's clear which number is which: `WORK 0:20 · REST 0:10 · INTERVALS 8 · SETS 2 · REST BETWEEN SETS 1:00 · TOTAL 8:45`. Rest between sets is shown only when there are 2+ sets.
- Each card has **Start**, **Edit** and **Delete** buttons (no Duplicate).
- **Delete** asks for confirmation.
- A **"+ New Routine"** button opens the editor, prefilled with the defaults and the next free `Routine N` name.
- On first launch, the app creates one sample routine: "Classic Tabata" (20/10 × 8 × 1).
- The last-used routine is highlighted.

### 5.2 Editor
- Contains every field from §3, with validation that enforces the ranges. Invalid input shows an inline error and disables Save.
- A live "Total duration" preview is shown.
- Buttons: **Save**, **Cancel**.
- Names do not need to be unique.

### 5.3 Number input control (used for every numeric field)
Every numeric field (Work, Rest, Rest between sets, Intervals, Sets, and the numeric settings in §6) uses the same control:

```
 [ − ]  [  0:20  ]  [ + ]
```

- **− / + buttons:** each click changes the value by one step. Pressing and holding the button repeats the step, and the repeat speeds up after about 1 s of holding.
  - Time fields: step = 1 s. After 2 s of holding, the step grows to 5 s.
  - Intervals / Sets: step = 1.
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
| Beep volume | − / + number control (§5.3, step 5 %) + slider + **"Test beep"** button | 0 – 100 % | 70 % |
| Counter digit color | Color picker (with a few presets) | any color except red, which is reserved for the last 5 s | White `#FFFFFF` |
| Counter digit size | − / + number control (§5.3, step 5 %) + slider, with live preview | 10 – 60 % of window height | 40 % |
| Mute | Toggle, also available on the run screen | on / off | off |

Beep volume and Mute can also be changed from the Run screen (§4.2).

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
    "muted": false,
    "digitColor": "#FFFFFF",
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
  - Unit tests (Vitest) for the engine: the phase sequence including the skipped final rest and the set-rest replacement, pause/resume math, total-duration calculation, and beep times.
  - Validation tests for all field ranges.
  - One Playwright smoke test: create a routine, run it, pause, resume, and finish it, using the speed flag.
- A dev-only **speed flag** (`?speed=10`) that makes time run faster, for quick manual testing.
- Supported browsers: latest Chrome and Safari on macOS.

---

## 9. Phase 2: macOS app (after the web version is approved)

- Wrap the Phase 1 frontend with **Tauri** (small app, ~10 MB, native WebKit).
- Output: a `.dmg` installer that drags the app into Applications.
- Target: **both Apple Silicon (arm64) and Intel (x86_64) Macs**. Build a single **universal binary** (`tauri build --target universal-apple-darwin`) so one `.dmg` works on both.
- Minimum macOS version: 11 (Big Sur), which is the Tauri 2 minimum.
- **Unsigned build is acceptable.** The first launch shows a Gatekeeper warning, and the user right-clicks → Open once. The README must explain this step.
- Mac-specific needs:
  - Prevent **App Nap** or throttling while a routine is running, so timing and beeps stay accurate in the background.
  - Prevent display sleep while running.
  - Routines are stored in a JSON file in the app's data folder instead of `localStorage`. Routines are not carried over from the web version; they are created again in the Mac app.

---

## 10. Out of scope
- Exercise names per interval
- Voice announcements
- Workout history and statistics
- User accounts, cloud sync, mobile apps
- PIN or password protection for admin

---

## 11. Acceptance criteria (Phase 1)
1. The user can create, edit and delete routines. New routines get a default name `Routine N`, and routines survive a page reload.
2. Validation enforces all ranges in §3 (intervals 1–20, sets 1–10, work 1 s–10 min, rest 1 s–3 min, rest between sets 1 s–5 min).
3. Every numeric field can be changed with the − / + buttons (including press-and-hold) and by typing a value, as described in §5.3.
4. A run follows exactly the phase sequence in §3.1, including the 5 s Get Ready, the rest between sets replacing the last Rest of each set, and the skipped final Rest. This is verified by unit tests.
5. The countdown digits are readable from 3 m away at the default size, and the size and color settings take effect immediately.
6. All phases use the same digit color. During the last 5 s of every phase, the digits and the ring are red, 4 short beeps play, and the 5th beep is long and marks the phase change.
7. Pause freezes time and sound, and Resume continues with less than 100 ms drift.
8. With the tab in the background for 60 s or more, beeps still play on time. When the user returns, the display shows the correct time and phase, and total drift over a 10-minute routine is under 250 ms.
9. The volume setting changes beep loudness, and 0 % or Mute is silent.
10. The app works offline after the first load.

---

## 12. Decision log
| Topic | Decision |
|---|---|
| "Repeats" | Renamed to **Sets** (1–10) |
| Final rest | The last Rest of the last set is skipped |
| Get Ready | Fixed 5 s, with the same red digits and beeps as other phases |
| Max intervals | 20 |
| Rest between sets | Configurable per routine, 1–300 s (default 60 s); replaces the last Rest of each set except the final set |
| Number inputs | − / + buttons (with press-and-hold) **and** manual typing for every numeric field |
| Beeps | 4 short beeps + 1 long 5th beep at the phase change |
| Colors | Same color for all phases; only the last 5 s turn red |
| Admin | No PIN |
| Export / Import | Removed from Settings; routines are not moved between the web version and the Mac app |
| Routine list | No Duplicate button (Start, Edit, Delete only) |
| Run-screen info | Set counter only at the start of the Work/Rest row; "Set remaining" and "Total remaining" together in the center; volume slider + mute in the top-right corner |
| Run-screen controls | Only Pause and Stop (no Skip or Restart); at the end: Start over and Back to routines |
| Mac packaging | Tauri, unsigned build accepted |
| Mac hardware | Universal binary for Apple Silicon and Intel |
| Exercise names, voice, history | Not needed |
