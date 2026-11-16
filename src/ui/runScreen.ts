import type { Routine } from '../routines/model';
import { PHASE_LABELS, TimerEngine, beepSchedule, cycleEndDue, startCallDue, tenCallDue, type Snapshot } from '../timer/engine';
import { pickPraise } from '../storage/storage';
import { sayCue, sayText } from '../platform/voice';
import { formatClock, formatCountdown } from '../timer/format';
import type { App, ClassContext, Screen } from './app';
import { classAdvance } from './classAdvance';
import { runPanel } from './runPanel';
import { h } from './dom';
import { isNative, setNativeKeepAwake, toggleFullscreen as platformToggleFullscreen } from '../platform/native';

/** How often the screen refreshes when the tab is hidden (rAF doesn't run then). */
const BACKGROUND_TICK_MS = 250;
/** The encouragement is spoken this long after the last beep of the cycle's work. */
const PRAISE_SPEAK_DELAY_MS = 2000;
/** At the end of the run, the last of the three finish bell strikes starts this late. */
const FINISH_LAST_STRIKE_MS = 1700;
/** In a class, the next item starts this long after a routine ends (after the finish bells and encouragement). */
const CLASS_NEXT_DELAY_SEC = 8;

/** The Run view (SPEC §4). */
export function runScreen(app: App, routine: Routine, ctx?: ClassContext): Screen {
  const cls = ctx ? classAdvance(ctx, CLASS_NEXT_DELAY_SEC, app.speed) : null;
  const engine = new TimerEngine(routine, () => performance.now(), app.speed);
  // With "Start!" on (and not muted), the voice replaces the long beep at the end of rest.
  const beeps = beepSchedule(engine.phases, { voiceStart: app.settings.startCall && !app.settings.muted });

  // --- Elements ---
  // Center: the period, the large counter and a bar under it that fills from left to right as the period runs.
  const phaseLabel = h('div', { class: 'run-phase', 'data-testid': 'run-phase' });
  const digits = h('div', { class: 'run-digits', 'data-testid': 'run-digits' });
  // Encouraging statement shown under the digits during the Rest between cycles (and at the end).
  const praiseLine = h('div', { class: 'run-praise', dir: 'auto', hidden: true, 'data-testid': 'run-praise' });
  const counter = h('div', { class: 'run-counter' }, digits, praiseLine);
  const progressFill = h('div', { class: 'run-progress-fill', 'data-testid': 'run-progress' });
  const progress = h('div', { class: 'run-progress', 'aria-hidden': 'true' }, progressFill);
  const stage = h('div', { class: 'run-stage' }, phaseLabel, counter, progress);
  if (cls) stage.append(cls.line);
  // Right: Next, Rounds left, Cycle, each round's Work / Rest and the remaining times.
  const panel = runPanel(routine, app.settings.showRemaining);
  const pauseBtn = h('button', { type: 'button', class: 'btn btn-run btn-primary', 'data-testid': 'pause', onclick: () => togglePause() }, 'PAUSE');
  const startOverBtn = h('button', { type: 'button', class: 'btn btn-run btn-primary', 'data-testid': 'start-over', hidden: true, onclick: () => app.startRoutine(routine.id) }, '↻ Start over');
  const stopBtn = h('button', { type: 'button', class: 'btn btn-run', 'data-testid': 'stop', onclick: () => requestStop() }, '■ STOP');
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

  const topLeft = h('div', { class: 'run-top-left' }, h('div', { class: 'run-name' }, 'Routine: “', h('bdi', {}, routine.name), '”'));
  const speedBadge = app.speed !== 1 ? h('div', { class: 'speed-badge' }, `×${app.speed} speed (dev)`) : null;
  const controls = h('div', { class: 'run-controls' }, pauseBtn, startOverBtn, cls?.nextBtn, stopBtn);
  const volumeGroup = h('div', { class: 'run-volume-group', 'data-testid': 'run-volume-group' }, muteBtn, h('div', { class: 'run-volume-stack' }, workVolume.el, restVolume.el));

  // Layout (SPEC §4.1): the counter in the middle of the page, the info panel on the right
  // (an empty column of the same width on the left keeps the counter centered).
  const el = h(
    'section',
    { class: 'run-screen routine-run', 'data-testid': 'run-screen' },
    h('div', { class: 'run-top' }, topLeft, h('div', { class: 'run-top-right' }, speedBadge, fullscreenBtn)),
    timeline,
    h('div', { class: 'run-main' }, stage, panel.el),
    // Bottom row: Pause / Stop in the center, volume controls on the right.
    h('div', { class: 'run-bottom' }, h('div', { class: 'run-bottom-side' }), controls, h('div', { class: 'run-bottom-side run-bottom-right' }, volumeGroup)),
  );

  // In a class: the class progress band takes the top 10% of the screen.
  if (cls) {
    el.prepend(cls.band);
    el.classList.add('in-class');
  }

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
    progressFill.style.width = `${done ? 100 : (1 - s.phaseFractionRemaining) * 100}%`;
    const pct = Math.min(100, (s.elapsedMs / s.totalMs) * 100);
    const clip = `inset(0 ${100 - pct}% 0 0)`;
    tlDone.style.clipPath = clip;
    tlDone.style.setProperty('-webkit-clip-path', clip); // older macOS WebKit
    tlMarker.style.left = `${pct}%`;

    panel.update(s);
    cls?.setProgress(s.elapsedMs / s.totalMs);
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
      startOverBtn.hidden = !!cls;
      stopBtn.textContent = cls ? '← Back to class' : '← Back to routines';
      cls?.finished();
      if (cls) requestAnimationFrame(() => fit());
      app.setFullWindow(true);
      void releaseWakeLock();
      // End of the last cycle: encouragement (spoken 2 s after the last finish bell).
      praise(true);
    } else {
      pauseBtn.textContent = s.status === 'paused' ? '▶ RESUME' : 'PAUSE';
      // Paused: the top bar comes back, so the user can switch to other pages and return later.
      app.setFullWindow(s.status !== 'paused');
      requestAnimationFrame(() => fit());
    }
  }

  /** Sizes the digits (setting = % of window height) and caps them to the available space. */
  function fit(): void {
    const target = (app.settings.digitSizePct / 100) * window.innerHeight * (smallDigits ? 0.8 : 1);
    digits.style.fontSize = `${target}px`;
    const pad = 24;
    const maxW = stage.clientWidth - pad;
    // Everything else in the counter area (period, progress bar, …) and the encouragement take room too.
    let others = praiseLine.hidden ? 0 : praiseLine.offsetHeight;
    for (const child of stage.children) if (child !== counter) others += (child as HTMLElement).offsetHeight;
    const maxH = stage.clientHeight - pad - others;
    if (maxW > 0 && maxH > 0) {
      const scale = Math.min(1, maxW / digits.scrollWidth, maxH / digits.offsetHeight);
      if (scale < 1) digits.style.fontSize = `${Math.floor(target * scale)}px`;
    }
  }

  // --- Loop: rAF for smooth animation while visible, an interval for the background.
  // It only runs while the screen is shown (a paused run can be left and come back to).
  let raf = 0;
  let bgTimer: ReturnType<typeof setInterval> | undefined;
  let attached = false;
  const frame = () => {
    if (!attached) return;
    render();
    raf = requestAnimationFrame(frame);
  };
  function attach(): void {
    if (attached) return;
    attached = true;
    bgTimer = setInterval(() => {
      if (document.hidden) render();
    }, BACKGROUND_TICK_MS);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('resize', onResize);
    raf = requestAnimationFrame(() => {
      fit();
      frame();
    });
  }
  function detach(): void {
    if (!attached) return;
    attached = false;
    cancelAnimationFrame(raf);
    clearInterval(bgTimer);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('resize', onResize);
  }
  /** Set by Stop / Back: the run is over and must not be kept when the screen is left. */
  let ended = false;

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
      void requestWakeLock();
    }
    render();
  }

  /** Stop: no confirmation. */
  function requestStop(): void {
    const status = engine.getStatus();
    if (status === 'done') return leave();
    if (ctx) {
      // In a class, Stop keeps the routine paused and opens the class page; Continue class resumes it.
      if (status === 'running') togglePause();
      ctx.back();
      return;
    }
    leave();
  }

  function leave(): void {
    ended = true;
    cls?.cancel();
    if (ctx) ctx.back();
    else app.go({ name: 'list' });
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
  const onResize = () => fit();

  // --- Start (we're inside the Start click, so audio is unlocked) ---
  engine.start();
  app.beeper.startRun(beeps, 0, engine.speed);
  void requestWakeLock();
  attach();
  render();

  return {
    el,
    fullWindow: true,
    session: ctx ? 'class' : 'routine',
    play() {
      if (engine.getStatus() === 'paused') togglePause();
    },
    keepAlive: () => !ended && engine.getStatus() === 'paused',
    hide() {
      detach();
      void releaseWakeLock();
    },
    show() {
      lastStatus = ''; // re-applies the paused layout (top bar shown)
      render();
      attach();
    },
    onKey(e) {
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        togglePause();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        requestStop();
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === 'Enter' && engine.getStatus() === 'done') {
        e.preventDefault();
        if (cls && ctx?.next) cls.nextBtn.click();
        else leave();
      }
    },
    destroy() {
      cls?.cancel();
      clearTimeout(praiseTimer);
      detach();
      engine.stop();
      app.beeper.cancel();
      void releaseWakeLock();
      if (document.fullscreenElement) void document.exitFullscreen?.();
    },
  };
}
