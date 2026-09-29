# Tabata Timer: Product Spec

> **Status:** Draft v0.1. Items marked **❓ OPEN** still need a decision from the product owner.
> Items marked **💡 PROPOSED** are suggestions that are in scope unless someone rejects them.
> **Audience:** Claude Code, which will implement this spec.

---

## 1. Overview

A Tabata / interval-training stopwatch for a trainer. The trainer creates and saves named routines, runs them with a large, easy-to-read countdown, and hears beeps near the end of every phase.

Delivery happens in two phases:

| Phase | Deliverable | Notes |
|---|---|---|
| **1. Web simulation** | Frontend-only web app that runs in a desktop browser (Chrome, Safari) | No backend. All data is stored in the browser. |
| **2. macOS app** | Installable `.dmg` built from the **same** frontend code | Starts only after Phase 1 is approved. See §9. |

Phase 1 must be built so it can be wrapped as a Mac app later without a rewrite (see §8).

---

## 2. Glossary

| Term | Meaning |
|---|---|
| **Work** | The training period (the user's "Training time"). |
| **Rest** | The rest period after each work period. |
| **Interval** | One Work + one Rest. |
| **Set** | A block of *N* intervals. The user's "Repeats" are the number of sets. |
| **Routine** | A saved, named configuration of all of the above. |
| **Phase** | The current state of the timer: `Get Ready`, `Work`, `Rest`, `Set Rest`, `Done`. |

---

## 3. Routine definition

| Field | Type | Range | Default | Notes |
|---|---|---|---|---|
| Name | text | 1–40 chars | `Routine N` | N is the next free number: `Routine 1`, `Routine 2`, … |
| Work time | seconds | 1 s – 600 s (10 min) | 20 s | Entered as mm:ss |
| Rest time | seconds | 1 s – 180 s (3 min) | 10 s | Entered as mm:ss |
| Intervals | integer | 1 – 50 ❓ | 8 | How many Work+Rest pairs make up one set |
| Sets (Repeats) | integer | 1 – 10 | 1 | How many times the whole block of intervals runs |
| 💡 Rest between sets | seconds | 0 s – 300 s | 60 s | Longer recovery between sets. 0 = none |
| 💡 Get-ready countdown | seconds | 0 s – 30 s | 10 s | Countdown before the first Work period |

The defaults (20 s / 10 s / 8 intervals) are the classic Tabata protocol.

### 3.1 Timeline example
Work 20 s, Rest 10 s, 3 intervals, 2 sets, set-rest 60 s:

```
Get Ready(10) → [W20 R10 W20 R10 W20 R10] → SetRest(60) → [W20 R10 W20 R10 W20 R10] → Done
```

❓ **OPEN Q1:** Should the **last Rest of each set be skipped**? Many timers skip it because Set Rest or Done follows immediately. Proposal: skip the final Rest of the last set, and replace the final Rest of other sets with Set Rest.

### 3.2 Derived values (shown in the editor)
- **Total routine duration**, for example "Total: 8:30".

---

## 4. Timer screen (the "Run" view)

This screen is used mid-workout, often from several meters away, so readability matters more than anything else.

### 4.1 Layout (desktop, landscape)

```
┌───────────────────────────────────────────────────────────┐
│  Routine: "Morning HIIT"                     Set 1 / 2    │
│                                                           │
│                        WORK                               │  ← phase label, colored
│                  ╭───────────────╮                        │
│                  │               │                        │
│                  │     0:17      │  ← HUGE digits         │
│                  │               │                        │
│                  ╰───────────────╯  ← progress ring/bar   │
│                                                           │
│   Work 0:20   │   Rest 0:10   │  Intervals left: 5 / 8    │
│                                                           │
│   Next: REST 0:10                Total remaining: 6:42    │
│                                                           │
│        [ ⏮ Restart ]   [ ⏯ PAUSE ]   [ ⏭ Skip ]  [ ■ Stop ]│
└───────────────────────────────────────────────────────────┘
```

### 4.2 Required display elements
1. **Countdown for the current phase** in very large digits (see §6 for size and color settings). Format is `m:ss`, or plain `ss` under 60 s (❓ **OPEN Q2**).
2. **Phase label**: WORK / REST / SET REST / GET READY / DONE.
3. **Work and Rest durations** of the routine.
4. **Intervals remaining** in the current set, for example `5 / 8`.
5. **Current set**, for example `Set 1 / 2`.
6. 💡 **Next phase** preview: "Next: REST 0:10".
7. 💡 **Total time remaining** for the whole routine.

### 4.3 Progress indicator
- A circular ring (or horizontal bar) around or below the digits that empties as the phase elapses. It animates smoothly and does not jump once per second.
- **Normal color follows the phase:** Work = green, Rest = blue, Set Rest = purple, Get Ready = yellow. 💡 The whole background also tints slightly with the phase color, so the phase is visible from across the room.
- **In the last 5 seconds of any phase** (Work, Rest, Set Rest, Get Ready), the indicator turns **red**.

### 4.4 Audio cues
| Moment | Sound |
|---|---|
| Last 5 seconds of **Work** (at 5, 4, 3, 2, 1) | Short beep each second |
| Last 5 seconds of **Rest** / Set Rest / Get Ready | Short beep each second |
| Phase change (reaches 0) | 💡 Longer or higher-pitched beep, so "go" sounds different from the countdown |
| Routine finished | 💡 A distinct "finished" sound, for example three long beeps |

- Beeps are **generated** with the Web Audio API (oscillator), not audio files. This keeps timing sample-accurate.
- Volume comes from the admin setting (§6).
- If a phase is 5 s or shorter, beep on every second of it.

### 4.5 Controls
| Control | Behavior | Keyboard 💡 |
|---|---|---|
| **Start** | Starts the selected routine (Get Ready phase first) | `Enter` |
| **Pause / Resume** | Freezes the countdown and sound; Resume continues from the exact remaining time | `Space` |
| 💡 Skip | Jumps to the next phase | `→` |
| 💡 Restart phase | Restarts the current phase | `←` |
| **Stop** | Ends the run and returns to the routine list, after an "Are you sure?" confirmation | `Esc` |
| 💡 Fullscreen | Toggles fullscreen | `F` |

The buttons must be large (at least 64 px tall), because the trainer may click them with sweaty hands.

### 4.6 Background behavior (critical)
The countdown **and the beeps must keep running** when the window or tab is not focused, is minimized, or is behind another app.

Implementation requirements:
- **Never compute time by counting `setInterval` ticks.** Browsers throttle timers in background tabs to 1 per second or less. Remaining time is always computed as `endTimestamp - performance.now()`.
- **Schedule beeps ahead of time on the Web Audio clock.** At phase start, or on resume, compute every beep time for the phase and schedule the oscillators with `audioContext.currentTime + offset`. The audio clock is not throttled in background tabs.
- The `AudioContext` is created or resumed on the first user click (the Start button), because browsers block autoplay otherwise.
- 💡 Request a **Screen Wake Lock** while running, so the display doesn't sleep mid-workout.
- 💡 Show the remaining time and phase in the **browser tab title**, for example `0:17 WORK – Tabata`.

---

## 5. Routines screen (list and editor)

### 5.1 List
- Shows all saved routines as cards with the name, a summary (`20s / 10s × 8 × 1 set`) and the total duration.
- Each card has **Start**, **Edit**, **Duplicate 💡** and **Delete** buttons.
- **Delete** asks for confirmation.
- A **"+ New Routine"** button opens the editor, prefilled with the defaults and the next free `Routine N` name.
- On first launch, the app creates one sample routine: "Classic Tabata" (20/10 × 8 × 1).
- 💡 The last-used routine is highlighted, and the app opens with it selected.

### 5.2 Editor
- Contains every field from §3, with validation that enforces the ranges. Invalid input shows an inline error and disables Save.
- Time fields use an `mm:ss` input with − / + stepper buttons (5 s steps; holding the button repeats).
- A live "Total duration" preview is shown.
- Buttons: **Save**, **Cancel**.
- Names do not need to be unique, but a duplicate name triggers a warning.

---

## 6. Settings ("Admin")

❓ **OPEN Q3:** Is "admin" just a **Settings screen**, or does it need a **PIN or password** so that trainees can't change routines? Proposal: a plain Settings screen with no PIN in v1.

| Setting | Control | Range | Default |
|---|---|---|---|
| Beep volume | Slider + **"Test beep"** button | 0 – 100 % | 70 % |
| 💡 Beep pitch / sound style | Dropdown | Classic beep / Low tone / Whistle | Classic |
| Counter digit color | Color picker + 💡 "Use phase colors" toggle | any | Use phase colors ON (white digits on a colored ring) |
| Counter digit size | Slider with live preview | S / M / L / XL / Max, or 10 – 60 % of viewport height | L (~40 vh) |
| 💡 Mute | Toggle, also on the run screen | on/off | off |
| 💡 Theme | Dark / Light | — | Dark (better contrast in a gym) |

- Settings apply immediately and persist.
- 💡 A "Reset to defaults" button.

---

## 7. Data and persistence

- **Phase 1:** `localStorage`, stored under versioned keys (`tabata.v1.routines` and `tabata.v1.settings`).
- The data model is JSON and versioned, so it can migrate later:

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
      "prepSec": 10,
      "createdAt": "ISO-8601",
      "updatedAt": "ISO-8601"
    }
  ],
  "settings": {
    "volume": 0.7,
    "digitColor": "#FFFFFF",
    "usePhaseColors": true,
    "digitSize": "L",
    "theme": "dark"
  }
}
```

- 💡 **Export / Import** routines as a `.json` file. This is a backup, and it is the way to move data from the web simulation into the Mac app.
- Storage access goes through a small `storage` module. That way Phase 2 can swap in file-based storage without touching the UI.

---

## 8. Technical approach (Phase 1)

- **Stack:** Vite + TypeScript. No UI framework, or a lightweight one (❓ **OPEN Q4:** vanilla TS vs React; proposal: vanilla TS, since the app is small).
- Frontend only, no backend, no network calls, fully offline.
- **Code structure:**
  - `timer/engine.ts`: a pure state machine that builds the phase sequence from a routine and exposes `start`, `pause`, `resume`, `skip` and `stop`. It has **no DOM or audio code** and is fully unit-tested.
  - `audio/beeper.ts`: Web Audio beep scheduling and volume.
  - `storage/`: persistence behind an interface.
  - `ui/`: screens (List, Editor, Run, Settings).
- **Tests:** unit tests (Vitest) for the engine (phase sequence, pause/resume math, skipped final rest, totals) and validation. One Playwright smoke test: create a routine, run it, pause, resume, and finish it at an accelerated speed.
- 💡 A dev-only **"speed ×10"** query flag (`?speed=10`) to make manual testing fast.
- Supported browsers: latest Chrome and Safari on macOS.

---

## 9. Phase 2: macOS app (later, after the web version is approved)

- Wrap the Phase 1 frontend with **Tauri** (small ~10 MB app, native WebKit) or **Electron** (~150 MB, bundles Chromium). ❓ **OPEN Q5**. Proposal: Tauri.
- Output: a `.dmg` installer that drags the app into Applications.
- Mac-specific needs:
  - Prevent **App Nap** or throttling while a routine is running, so timing and beeps stay accurate in the background.
  - Prevent display sleep while running.
  - 💡 Dock badge or menu-bar item showing the remaining time.
  - 💡 A native notification when the routine finishes.
- **Code signing and notarization:** without an Apple Developer account ($99/yr), macOS Gatekeeper warns on first launch, and the user must right-click → Open. ❓ **OPEN Q6:** is an unsigned app acceptable for personal use?
- Apple Silicon (arm64) is required. Intel is optional (❓ **OPEN Q7**).

---

## 10. Out of scope (v1)
- User accounts, cloud sync, mobile apps.
- Per-interval custom exercises or names (see ideas below).
- Workout history and statistics.

## 11. Ideas for later versions 💡
- **Named exercises per interval**, for example "Burpees", "Squats", with "Next: Squats" shown during Rest.
- **Voice announcements** (speech synthesis): "Rest", "Go", "3, 2, 1".
- **Workout log**: date, routine and completed or aborted.
- **Mirror / second-screen mode** for a projector or TV in the gym.
- **Warm-up and cool-down** phases.

---

## 12. Acceptance criteria (Phase 1)
1. The user can create, edit, duplicate and delete routines. New routines get a default name `Routine N`, and routines survive a page reload.
2. Validation enforces all ranges in §3.
3. Running a routine follows exactly the phase sequence in §3.1. This is verified by unit tests.
4. The countdown digits are readable from 3 m away at the default size, and the size and color settings take effect immediately.
5. The indicator turns red during the last 5 s of every phase, and a beep sounds at each of those seconds.
6. Pause freezes time and sound, and Resume continues with less than 100 ms drift.
7. With the tab in the background for 60 s or more, beeps still play on time. When the user returns, the display shows the correct time, and total drift over a 10-minute routine is under 250 ms.
8. The volume setting changes beep loudness, and 0 % is silent.
9. The app works offline after the first load.

---

## 13. Open questions summary
| # | Question | Proposed default |
|---|---|---|
| Q1 | Skip the last Rest of a set? | Yes (replaced by Set Rest or Done) |
| Q2 | Show `0:17` or `17` under one minute? | `0:17` |
| Q3 | Should admin be PIN-protected? | No PIN in v1 |
| Q4 | Vanilla TS or React? | Vanilla TS |
| Q5 | Tauri or Electron for the Mac build? | Tauri |
| Q6 | Is an unsigned Mac app acceptable? | Yes (personal use) |
| Q7 | Intel Mac support needed? | Apple Silicon only |
| Q8 | Max number of intervals? | 50 |
