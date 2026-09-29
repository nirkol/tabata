import type { Routine } from '../routines/model';
import { PHASE_LABELS, TimerEngine, beepSchedule, type Snapshot } from '../timer/engine';
import { formatClock, formatCountdown } from '../timer/format';
import type { App, Screen } from './app';
import { confirmDialog } from './dialog';
import { h } from './dom';

/** How often the screen refreshes when the tab is hidden (rAF doesn't run then). */
const BACKGROUND_TICK_MS = 250;
const RING_STROKE = 8;

/** The Run view (SPEC §4). */
export function runScreen(app: App, routine: Routine): Screen {
  const engine = new TimerEngine(routine, () => performance.now(), app.speed);
  const beeps = beepSchedule(engine.phases);

  // --- Elements ---
  const setLabel = h('div', { class: 'run-set', 'data-testid': 'run-set' });
  const phaseLabel = h('div', { class: 'run-phase', 'data-testid': 'run-phase' });
  const digits = h('div', { class: 'run-digits', 'data-testid': 'run-digits' });
  const svgNs = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNs, 'svg');
  svg.setAttribute('class', 'ring');
  svg.setAttribute('aria-hidden', 'true');
  const track = document.createElementNS(svgNs, 'path');
  track.setAttribute('class', 'ring-track');
  const ring = document.createElementNS(svgNs, 'path');
  ring.setAttribute('class', 'ring-progress');
  ring.setAttribute('pathLength', '100');
  ring.setAttribute('data-testid', 'run-ring');
  svg.append(track, ring);
  const ringBox = h('div', { class: 'ring-box' }, digits);
  ringBox.prepend(svg);
  const stage = h('div', { class: 'run-stage' }, ringBox);

  const setInfo = h('span', { 'data-testid': 'run-set-info' });
  const intervalsLeft = h('span', { 'data-testid': 'run-intervals' });
  const setRemaining = h('span', { 'data-testid': 'run-set-remaining' });
  const next = h('span', { class: 'run-next', 'data-testid': 'run-next' });
  const totalRemaining = h('span', { 'data-testid': 'run-total' });
  const pauseBtn = h('button', { type: 'button', class: 'btn btn-run btn-primary', 'data-testid': 'pause', onclick: () => togglePause() }, 'PAUSE');
  const startOverBtn = h('button', { type: 'button', class: 'btn btn-run btn-primary', 'data-testid': 'start-over', hidden: true, onclick: () => app.startRoutine(routine.id) }, '↻ Start over');
  const stopBtn = h('button', { type: 'button', class: 'btn btn-run', 'data-testid': 'stop', onclick: () => void requestStop() }, '■ STOP');
  const muteBtn = h('button', { type: 'button', class: 'btn btn-icon', 'data-testid': 'run-mute', onclick: () => toggleMute() });
  const fullscreenBtn = h('button', { type: 'button', class: 'btn btn-icon', title: 'Fullscreen (F)', 'aria-label': 'Toggle fullscreen', onclick: () => toggleFullscreen() }, '⛶');

  const el = h(
    'section',
    { class: 'run-screen', 'data-testid': 'run-screen' },
    h(
      'div',
      { class: 'run-top' },
      h('div', { class: 'run-name' }, `Routine: “${routine.name}”`),
      app.speed !== 1 ? h('div', { class: 'speed-badge' }, `×${app.speed} speed (dev)`) : null,
      h('div', { class: 'run-top-right' }, setLabel, muteBtn, fullscreenBtn),
    ),
    phaseLabel,
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
    h('div', { class: 'run-info run-info-secondary' }, next, setRemaining, totalRemaining),
    h('div', { class: 'run-controls' }, pauseBtn, startOverBtn, stopBtn),
  );

  // --- Rendering ---
  let lastDigitsText = '';
  let lastStatus = '';

  function render(): void {
    const s = engine.snapshot();
    app.beeper.sync(s.elapsedMs);
    const done = s.status === 'done';
    const phase = s.phase;
    const label = done ? PHASE_LABELS.done : PHASE_LABELS[phase!.kind];
    const setNo = phase ? phase.set : routine.sets;

    setLabel.textContent = `Set ${setNo} / ${routine.sets}`;
    setInfo.textContent = `Set ${setNo} / ${routine.sets}`;
    phaseLabel.textContent = label;
    const text = done ? '0:00' : formatCountdown(s.phaseRemainingMs);
    if (text !== digits.textContent) digits.textContent = text;
    if (text.length !== lastDigitsText.length) {
      lastDigitsText = text;
      fit();
    }
    el.classList.toggle('warning', s.warning);
    el.classList.toggle('paused', s.status === 'paused');
    el.classList.toggle('done', done);
    ring.style.strokeDashoffset = String(100 * (1 - (done ? 0 : s.phaseFractionRemaining)));

    intervalsLeft.textContent = `Intervals left: ${s.intervalsLeft} / ${routine.intervals}`;
    next.textContent = done ? '' : `Next: ${s.nextPhase ? `${PHASE_LABELS[s.nextPhase.kind]} ${formatClock(s.nextPhase.durationSec)}` : PHASE_LABELS.done}`;
    setRemaining.textContent = `Set remaining: ${formatCountdown(s.setRemainingMs)}`;
    totalRemaining.textContent = `Total remaining: ${formatCountdown(s.totalRemainingMs)}`;
    muteBtn.textContent = app.settings.muted ? '🔇' : '🔊';
    muteBtn.setAttribute('aria-label', app.settings.muted ? 'Unmute' : 'Mute');

    if (s.status !== lastStatus) {
      lastStatus = s.status;
      onStatusChange(s);
    }
    document.title = done ? 'DONE – Tabata' : `${text} ${label}${s.status === 'paused' ? ' (paused)' : ''} – Tabata`;
  }

  function onStatusChange(s: Snapshot): void {
    if (s.status === 'done') {
      pauseBtn.hidden = true;
      startOverBtn.hidden = false;
      stopBtn.textContent = '← Back to routines';
      void releaseWakeLock();
    } else {
      pauseBtn.textContent = s.status === 'paused' ? '▶ RESUME' : 'PAUSE';
    }
  }

  /** Sizes the digits (setting = % of window height) and caps them to the available space. */
  function fit(): void {
    const target = (app.settings.digitSizePct / 100) * window.innerHeight;
    digits.style.fontSize = `${target}px`;
    const pad = RING_STROKE * 2 + 24;
    const maxW = stage.clientWidth - pad;
    const maxH = stage.clientHeight - pad;
    if (maxW > 0 && maxH > 0) {
      const scale = Math.min(1, maxW / digits.scrollWidth, maxH / digits.offsetHeight);
      if (scale < 1) digits.style.fontSize = `${Math.floor(target * scale)}px`;
    }
    drawRing();
  }

  /** Rounded-rectangle progress path starting at the top center, clockwise. */
  function drawRing(): void {
    const w = ringBox.clientWidth;
    const hgt = ringBox.clientHeight;
    const i = RING_STROKE / 2;
    const r = Math.min(40, hgt / 4);
    const x0 = i, y0 = i, x1 = w - i, y1 = hgt - i;
    const cx = w / 2;
    const d = [
      `M ${cx} ${y0}`,
      `H ${x1 - r}`, `A ${r} ${r} 0 0 1 ${x1} ${y0 + r}`,
      `V ${y1 - r}`, `A ${r} ${r} 0 0 1 ${x1 - r} ${y1}`,
      `H ${x0 + r}`, `A ${r} ${r} 0 0 1 ${x0} ${y1 - r}`,
      `V ${y0 + r}`, `A ${r} ${r} 0 0 1 ${x0 + r} ${y0}`,
      `Z`,
    ].join(' ');
    svg.setAttribute('viewBox', `0 0 ${w} ${hgt}`);
    track.setAttribute('d', d);
    ring.setAttribute('d', d);
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
    if (engine.getStatus() === 'done') return leave();
    if (await confirmDialog('Stop this routine and go back to the list?', 'Stop')) leave();
  }

  function leave(): void {
    app.go({ name: 'list' });
  }

  function toggleMute(): void {
    app.updateSettings({ muted: !app.settings.muted });
    render();
  }

  function toggleFullscreen(): void {
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  }

  // --- Screen Wake Lock (SPEC §4.6) ---
  let wakeLock: WakeLockSentinel | null = null;
  async function requestWakeLock(): Promise<void> {
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
