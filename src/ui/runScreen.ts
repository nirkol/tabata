import type { Routine } from '../routines/model';
import { PHASE_LABELS, TimerEngine, beepSchedule, cycleEndDue, startCallDue, tenCallDue, type Snapshot } from '../timer/engine';
import { pickPraise } from '../storage/storage';
import { sayCue, sayText } from '../platform/voice';
import { formatClock, formatCountdown } from '../timer/format';
import type { App, Screen } from './app';
import { confirmDialog } from './dialog';
import { h } from './dom';
import { RING_STROKE, createRing } from './ring';
import { isNative, setNativeKeepAwake, toggleFullscreen as platformToggleFullscreen } from '../platform/native';

/** How often the screen refreshes when the tab is hidden (rAF doesn't run then). */
const BACKGROUND_TICK_MS = 250;
/** The encouragement is spoken this long after the last beep of the cycle's work. */
const PRAISE_SPEAK_DELAY_MS = 2000;
/** At the end of the run, the last of the three finish bell strikes starts this late. */
const FINISH_LAST_STRIKE_MS = 1700;

/** The Run view (SPEC §4). */
export function runScreen(app: App, routine: Routine): Screen {
  const engine = new TimerEngine(routine, () => performance.now(), app.speed);
  // With "Start!" on (and not muted), the voice replaces the long beep at the end of rest.
  const beeps = beepSchedule(engine.phases, { voiceStart: app.settings.startCall && !app.settings.muted });

  // --- Elements ---
  const phaseLabel = h('div', { class: 'run-phase', 'data-testid': 'run-phase' });
  const digits = h('div', { class: 'run-digits', 'data-testid': 'run-digits' });
  const ring = createRing();
  // Encouraging statement shown under the digits during the Rest between cycles (and at the end).
  const praiseLine = h('div', { class: 'run-praise', dir: 'auto', hidden: true, 'data-testid': 'run-praise' });
  const ringBox = h('div', { class: 'ring-box' }, h('div', { class: 'ring-content' }, digits, praiseLine));
  ringBox.prepend(ring.svg);
  // The phase label sits right above the counter, so the two read as one unit.
  const stage = h('div', { class: 'run-stage' }, phaseLabel, ringBox);

  const setInfo = h('span', { 'data-testid': 'run-set-info' });
  const intervalsLeft = h('span', { 'data-testid': 'run-intervals' });
  const setRemaining = h('span', { 'data-testid': 'run-set-remaining' });
  const next = h('span', { class: 'run-next', 'data-testid': 'run-next' });
  // "Next: …" sits just outside the counter box, at its bottom-right corner.
  ringBox.append(next);
  const totalRemaining = h('span', { 'data-testid': 'run-total' });
  const pauseBtn = h('button', { type: 'button', class: 'btn btn-run btn-primary', 'data-testid': 'pause', onclick: () => togglePause() }, 'PAUSE');
  const startOverBtn = h('button', { type: 'button', class: 'btn btn-run btn-primary', 'data-testid': 'start-over', hidden: true, onclick: () => app.startRoutine(routine.id) }, '↻ Start over');
  const stopBtn = h('button', { type: 'button', class: 'btn btn-run', 'data-testid': 'stop', onclick: () => void requestStop() }, '■ STOP');
  const muteBtn = h('button', { type: 'button', class: 'btn btn-icon', 'data-testid': 'run-mute', onclick: () => toggleMute() });
  /** A compact volume slider for the work or rest beeps. */
  function volumeControl(key: 'volume' | 'restVolume', label: string, testId: string) {
    const slider = h('input', { type: 'range', class: 'run-volume', min: 0, max: 100, step: 5, 'aria-label': label, 'data-testid': testId });
    slider.value = String(Math.round(app.settings[key] * 100));
    const value = h('span', { class: 'run-volume-value', 'data-testid': `${testId}-value` });
    slider.addEventListener('input', () => {
      const v = Number(slider.value) / 100;
      // Turning a volume up while muted unmutes, so the change is audible.
      app.updateSettings(v > 0 && app.settings.muted ? { [key]: v, muted: false } : { [key]: v });
      render();
    });
    const el = h('label', { class: 'run-volume-item' }, h('span', { class: 'run-volume-label' }, label), slider, value);
    const update = () => {
      value.textContent = `${Math.round(app.settings[key] * 100)}%`;
      slider.classList.toggle('muted', app.settings.muted);
    };
    return { el, update };
  }
  const workVolume = volumeControl('volume', 'Work volume', 'run-volume');
  const restVolume = volumeControl('restVolume', 'Rest volume', 'run-volume-rest');
  const fullscreenBtn = h('button', { type: 'button', class: 'btn btn-icon', title: 'Fullscreen (F)', 'aria-label': 'Toggle fullscreen', onclick: () => toggleFullscreen() }, '⛶');

  // --- Workout timeline: one segment per phase, sized by duration (work color / red for rest).
  // A dim base layer shows the plan; a bright copy is revealed up to the current point.
  const segment = (p: (typeof engine.phases)[number]) =>
    h('div', {
      class: `tl-seg ${p.kind === 'work' ? 'tl-work' : 'tl-rest'}`,
      style: `flex-grow:${p.durationSec}`,
      title: `${PHASE_LABELS[p.kind]} ${formatClock(p.durationSec)}`,
    });
  const tlDone = h('div', { class: 'tl-layer tl-done', 'data-testid': 'timeline-done' }, ...engine.phases.map(segment));
  const tlMarker = h('div', { class: 'tl-marker', 'data-testid': 'timeline-marker' });
  const timeline = h(
    'div',
    { class: 'timeline', 'data-testid': 'timeline', 'aria-hidden': 'true' },
    h('div', { class: 'tl-layer tl-plan' }, ...engine.phases.map(segment)),
    tlDone,
    tlMarker,
  );

  const el = h(
    'section',
    { class: 'run-screen', 'data-testid': 'run-screen' },
    h(
      'div',
      { class: 'run-top' },
      h('div', { class: 'run-name' }, 'Routine: “', h('bdi', {}, routine.name), '”'),
      app.speed !== 1 ? h('div', { class: 'speed-badge' }, `×${app.speed} speed (dev)`) : null,
      h('div', { class: 'run-top-right' }, fullscreenBtn),
    ),
    timeline,
    stage,
    h(
      'div',
      { class: 'run-info' },
      setInfo,
      h('span', { class: 'sep' }, '│'),
      h('span', {}, `Work ${formatClock(routine.workSec)}`),
      h('span', { class: 'sep' }, '│'),
      h('span', {}, `Rest ${formatClock(routine.restSec)}`),
      h('span', { class: 'sep' }, '│'),
      intervalsLeft,
    ),
    h('div', { class: 'run-info run-info-secondary' }, h('span'), h('div', { class: 'run-remaining', 'data-testid': 'run-remaining', hidden: !app.settings.showRemaining }, setRemaining, h('span', { class: 'sep' }, '│'), totalRemaining), h('span')),
    // Bottom row: Pause / Stop in the center, volume controls on the right.
    h(
      'div',
      { class: 'run-bottom' },
      h('div', { class: 'run-bottom-side' }),
      h('div', { class: 'run-controls' }, pauseBtn, startOverBtn, stopBtn),
      h('div', { class: 'run-bottom-side run-bottom-right' }, h('div', { class: 'run-volume-group', 'data-testid': 'run-volume-group' }, muteBtn, h('div', { class: 'run-volume-stack' }, workVolume.el, restVolume.el))),
    ),
  );

  // --- Rendering ---
  let lastDigitsText = '';
  let smallDigits = false;
  let lastStatus = '';

  let tenCalledPhase = -1;
  let startCalledPhase = -1;
  let praisedPhase = -1;
  let lastPraise: string | null = null;
  let praiseTimer: ReturnType<typeof setTimeout> | undefined;
  /**
   * End of a cycle: shows a random encouraging statement under the digits right away, and
   * speaks it 2 s after the last beep (only if the run is still at that point, not paused/left).
   */
  function praise(final: boolean): void {
    if (!app.settings.praiseCall) return;
    const text = pickPraise(app.settings.praises, lastPraise);
    if (!text) return;
    lastPraise = text;
    showPraise(text);
    clearTimeout(praiseTimer);
    // (Divided by the dev speed flag so sped-up test runs keep the same proportions; 1× in the app.)
    const delay = (PRAISE_SPEAK_DELAY_MS + (final ? FINISH_LAST_STRIKE_MS : 0)) / engine.speed;
    praiseTimer = setTimeout(() => {
      const s = engine.snapshot();
      const stillThere = final ? s.status === 'done' : s.status === 'running' && s.phase?.kind === 'setRest';
      if (!stillThere || app.settings.muted) return;
      // A quick "ta-da" fanfare, then the statement in an excited voice.
      const fanfareMs = app.beeper.fanfare();
      praiseTimer = setTimeout(() => sayText(text, app.settings.volume), fanfareMs);
    }, delay);
  }
  function showPraise(text: string | null): void {
    const show = text !== null;
    if (show === !praiseLine.hidden && praiseLine.textContent === (text ?? '')) return;
    praiseLine.textContent = text ?? '';
    praiseLine.hidden = !show;
    fit(); // the digits make room for the statement
  }

  function render(): void {
    const s = engine.snapshot();
    app.beeper.sync(s.elapsedMs);
    // Voice cues on top of the beeps: "Start!" when a Work period begins, "Ten!" 10 s before it ends.
    if (startCallDue(s, startCalledPhase)) {
      startCalledPhase = s.phaseIndex;
      if (app.settings.startCall && !app.settings.muted) sayCue('start', app.settings.volume);
    }
    // End of a cycle (the Rest between cycles begins): encouragement, shown for the whole rest.
    if (cycleEndDue(s, praisedPhase)) {
      praisedPhase = s.phaseIndex;
      praise(false);
    }
    if (s.status !== 'done' && s.phase?.kind !== 'setRest' && !praiseLine.hidden) showPraise(null);
    if (tenCallDue(s, tenCalledPhase)) {
      tenCalledPhase = s.phaseIndex;
      if (app.settings.tenCall && !app.settings.muted) sayCue('ten', app.settings.volume);
    }
    const done = s.status === 'done';
    const phase = s.phase;
    const label = done ? PHASE_LABELS.done : PHASE_LABELS[phase!.kind];
    const setNo = phase ? phase.set : routine.sets;

    setInfo.textContent = `Cycle ${setNo} / ${routine.sets}`;
    phaseLabel.textContent = label;
    const text = done ? '0:00' : formatCountdown(s.phaseRemainingMs);
    if (text !== digits.textContent) digits.textContent = text;
    // During the Rest between cycles the counter is 20% smaller, making room for the statement.
    const small = !done && phase?.kind === 'setRest';
    if (text.length !== lastDigitsText.length || small !== smallDigits) {
      lastDigitsText = text;
      smallDigits = small;
      fit();
    }
    el.classList.toggle('warning', s.warning);
    // Work is always green; Get Ready, Rest and Cycle Rest are always red.
    el.classList.toggle('phase-work', !done && phase?.kind === 'work');
    el.classList.toggle('phase-rest', !done && phase !== null && phase.kind !== 'work');
    el.classList.toggle('paused', s.status === 'paused');
    el.classList.toggle('done', done);
    ring.setFraction(done ? 0 : s.phaseFractionRemaining);
    const pct = Math.min(100, (s.elapsedMs / s.totalMs) * 100);
    const clip = `inset(0 ${100 - pct}% 0 0)`;
    tlDone.style.clipPath = clip;
    tlDone.style.setProperty('-webkit-clip-path', clip); // older macOS WebKit
    tlMarker.style.left = `${pct}%`;

    intervalsLeft.textContent = `Rounds left: ${s.intervalsLeft} / ${routine.intervals}`;
    next.textContent = done ? '' : `Next: ${s.nextPhase ? `${PHASE_LABELS[s.nextPhase.kind]} ${formatClock(s.nextPhase.durationSec)}` : PHASE_LABELS.done}`;
    setRemaining.textContent = `Cycle remaining: ${formatCountdown(s.setRemainingMs)}`;
    totalRemaining.textContent = `Total remaining: ${formatCountdown(s.totalRemainingMs)}`;
    muteBtn.textContent = app.settings.muted ? '🔇' : '🔊';
    muteBtn.setAttribute('aria-label', app.settings.muted ? 'Unmute' : 'Mute');
    workVolume.update();
    restVolume.update();

    if (s.status !== lastStatus) {
      lastStatus = s.status;
      onStatusChange(s);
    }
    document.title = done ? 'DONE – yFit Workout Timer' : `${text} ${label}${s.status === 'paused' ? ' (paused)' : ''} – yFit Workout Timer`;
  }

  function onStatusChange(s: Snapshot): void {
    if (s.status === 'done') {
      pauseBtn.hidden = true;
      startOverBtn.hidden = false;
      stopBtn.textContent = '← Back to routines';
      void releaseWakeLock();
      // End of the last cycle: encouragement (spoken 2 s after the last finish bell).
      praise(true);
    } else {
      pauseBtn.textContent = s.status === 'paused' ? '▶ RESUME' : 'PAUSE';
    }
  }

  /** Sizes the digits (setting = % of window height) and caps them to the available space. */
  function fit(): void {
    const target = (app.settings.digitSizePct / 100) * window.innerHeight * (smallDigits ? 0.8 : 1);
    digits.style.fontSize = `${target}px`;
    const pad = RING_STROKE * 2 + 24;
    const maxW = stage.clientWidth - pad;
    const maxH = stage.clientHeight - pad - phaseLabel.offsetHeight - (praiseLine.hidden ? 0 : praiseLine.offsetHeight);
    if (maxW > 0 && maxH > 0) {
      const scale = Math.min(1, maxW / digits.scrollWidth, maxH / digits.offsetHeight);
      if (scale < 1) digits.style.fontSize = `${Math.floor(target * scale)}px`;
    }
    ring.draw(ringBox);
  }

  // --- Loop: rAF for smooth animation while visible, an interval for the background ---
  let raf = 0;
  const frame = () => {
    render();
    raf = requestAnimationFrame(frame);
  };
  const bgTimer = setInterval(() => {
    if (document.hidden) render();
  }, BACKGROUND_TICK_MS);

  // --- Controls ---
  function togglePause(): void {
    const status = engine.getStatus();
    if (status === 'running') {
      engine.pause();
      app.beeper.cancel();
    } else if (status === 'paused') {
      app.beeper.unlock();
      engine.resume();
      app.beeper.startRun(beeps, engine.elapsedMs(), engine.speed);
    }
    render();
  }

  async function requestStop(): Promise<void> {
    const status = engine.getStatus();
    if (status === 'done') return leave();
    // Stopping a running routine pauses it while asking, so it can't be stopped by accident.
    const wasRunning = status === 'running';
    if (wasRunning) togglePause();
    if (await confirmDialog('Stop this routine and go back to the list?', 'Stop')) leave();
    else if (wasRunning) togglePause(); // cancelled: carry on from the same second
  }

  function leave(): void {
    app.go({ name: 'list' });
  }

  function toggleMute(): void {
    app.updateSettings({ muted: !app.settings.muted });
    render();
  }

  function toggleFullscreen(): void {
    void platformToggleFullscreen().catch(() => undefined);
  }

  // --- Screen Wake Lock (SPEC §4.6) ---
  // In the Mac app the native side keeps the display awake; in the browser, the Wake Lock API.
  let wakeLock: WakeLockSentinel | null = null;
  let nativeAwake = false;
  async function requestWakeLock(): Promise<void> {
    if (isNative()) {
      if (!nativeAwake && engine.getStatus() !== 'done') nativeAwake = await setNativeKeepAwake(true);
      return;
    }
    try {
      if ('wakeLock' in navigator && !wakeLock && engine.getStatus() !== 'done') {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => (wakeLock = null));
      }
    } catch {
      // Not supported or not allowed; the timer still works.
    }
  }
  async function releaseWakeLock(): Promise<void> {
    if (nativeAwake) {
      nativeAwake = false;
      await setNativeKeepAwake(false);
    }
    const lock = wakeLock;
    wakeLock = null;
    await lock?.release().catch(() => undefined);
  }
  const onVisibility = () => {
    render(); // catch up immediately when the tab comes back
    if (!document.hidden) void requestWakeLock();
  };
  document.addEventListener('visibilitychange', onVisibility);
  const onResize = () => fit();
  window.addEventListener('resize', onResize);

  // --- Start (we're inside the Start click, so audio is unlocked) ---
  engine.start();
  app.beeper.startRun(beeps, 0, engine.speed);
  void requestWakeLock();
  requestAnimationFrame(() => {
    fit();
    frame();
  });
  render();

  return {
    el,
    fullWindow: true,
    onKey(e) {
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        togglePause();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        void requestStop();
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === 'Enter' && engine.getStatus() === 'done') {
        e.preventDefault();
        leave();
      }
    },
    destroy() {
      clearTimeout(praiseTimer);
      cancelAnimationFrame(raf);
      clearInterval(bgTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', onResize);
      engine.stop();
      app.beeper.cancel();
      void releaseWakeLock();
      if (document.fullscreenElement) void document.exitFullscreen?.();
    },
  };
}
