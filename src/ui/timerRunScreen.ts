import { Countdown, countdownBeeps } from '../timers/countdown';
import { timerTitle, type PresetTimer } from '../timers/model';
import { formatCountdown } from '../timer/format';
import { isNative, setNativeKeepAwake, toggleFullscreen as platformToggleFullscreen } from '../platform/native';
import type { App, Screen } from './app';
import { confirmDialog } from './dialog';
import { h } from './dom';
import { RING_STROKE, createRing } from './ring';

/** How often the screen refreshes when the tab is hidden (rAF doesn't run then). */
const BACKGROUND_TICK_MS = 250;

/** The Timer view (SPEC §5b): a large countdown with the same ring as the Run screen. */
export function timerRunScreen(app: App, timer: PresetTimer): Screen {
  const countdown = new Countdown(timer.durationSec, () => performance.now(), app.speed);
  const beeps = countdownBeeps(timer.durationSec);
  const title = timerTitle(timer);

  // --- Elements (same layout and classes as the Run screen) ---
  const phaseLabel = h('div', { class: 'run-phase', 'data-testid': 'run-phase' });
  const digits = h('div', { class: 'run-digits', 'data-testid': 'run-digits' });
  const ring = createRing();
  const ringBox = h('div', { class: 'ring-box' }, ring.svg, h('div', { class: 'ring-content' }, digits));
  const stage = h('div', { class: 'run-stage' }, phaseLabel, ringBox);

  const pauseBtn = h('button', { type: 'button', class: 'btn btn-run btn-primary', 'data-testid': 'pause', onclick: () => togglePause() }, 'PAUSE');
  const startOverBtn = h('button', { type: 'button', class: 'btn btn-run btn-primary', 'data-testid': 'start-over', hidden: true, onclick: () => app.startTimer(timer.id) }, '↻ Start over');
  const stopBtn = h('button', { type: 'button', class: 'btn btn-run', 'data-testid': 'stop', onclick: () => void requestStop() }, '■ STOP');
  const muteBtn = h('button', { type: 'button', class: 'btn btn-icon', 'data-testid': 'run-mute', onclick: () => toggleMute() });
  const slider = h('input', { type: 'range', class: 'run-volume', min: 0, max: 100, step: 5, 'aria-label': 'Volume', 'data-testid': 'run-volume' });
  slider.value = String(Math.round(app.settings.volume * 100));
  const volumeValue = h('span', { class: 'run-volume-value', 'data-testid': 'run-volume-value' });
  slider.addEventListener('input', () => {
    const v = Number(slider.value) / 100;
    app.updateSettings(v > 0 && app.settings.muted ? { volume: v, muted: false } : { volume: v });
    render();
  });
  const fullscreenBtn = h('button', { type: 'button', class: 'btn btn-icon', title: 'Fullscreen (F)', 'aria-label': 'Toggle fullscreen', onclick: () => toggleFullscreen() }, '⛶');

  const el = h(
    'section',
    { class: 'run-screen timer-run phase-work', 'data-testid': 'timer-run-screen' },
    h(
      'div',
      { class: 'run-top' },
      h('div', { class: 'run-name' }, 'Timer: “', h('bdi', { 'data-testid': 'timer-run-name' }, title), '”'),
      app.speed !== 1 ? h('div', { class: 'speed-badge' }, `×${app.speed} speed (dev)`) : null,
      h('div', { class: 'run-top-right' }, fullscreenBtn),
    ),
    stage,
    h(
      'div',
      { class: 'run-bottom' },
      h('div', { class: 'run-bottom-side' }),
      h('div', { class: 'run-controls' }, pauseBtn, startOverBtn, stopBtn),
      h(
        'div',
        { class: 'run-bottom-side run-bottom-right' },
        h(
          'div',
          { class: 'run-volume-group', 'data-testid': 'run-volume-group' },
          muteBtn,
          h('div', { class: 'run-volume-stack' }, h('label', { class: 'run-volume-item' }, h('span', { class: 'run-volume-label' }, 'Volume'), slider, volumeValue)),
        ),
      ),
    ),
  );

  // --- Rendering ---
  let lastDigitsText = '';
  let lastStatus = '';

  function render(): void {
    const status = countdown.getStatus();
    const elapsed = countdown.elapsedMs();
    app.beeper.sync(elapsed);
    const done = status === 'done';
    const text = done ? '0:00' : formatCountdown(countdown.remainingMs());
    if (text !== digits.textContent) digits.textContent = text;
    if (text.length !== lastDigitsText.length) {
      lastDigitsText = text;
      fit();
    }
    phaseLabel.textContent = done ? "TIME'S UP" : 'TIMER';
    ring.setFraction(done ? 0 : countdown.fractionRemaining());
    el.classList.toggle('paused', status === 'paused');
    el.classList.toggle('done', done);
    muteBtn.textContent = app.settings.muted ? '🔇' : '🔊';
    muteBtn.setAttribute('aria-label', app.settings.muted ? 'Unmute' : 'Mute');
    volumeValue.textContent = `${Math.round(app.settings.volume * 100)}%`;
    slider.classList.toggle('muted', app.settings.muted);

    if (status !== lastStatus) {
      lastStatus = status;
      if (done) {
        pauseBtn.hidden = true;
        startOverBtn.hidden = false;
        stopBtn.textContent = '← Back to timers';
        void releaseWakeLock();
      } else {
        pauseBtn.textContent = status === 'paused' ? '▶ RESUME' : 'PAUSE';
      }
    }
    document.title = done ? "TIME'S UP – yFit Workout Timer" : `${text} ${title}${status === 'paused' ? ' (paused)' : ''} – yFit Workout Timer`;
  }

  /** Sizes the digits (setting = % of window height) and caps them to the available space. */
  function fit(): void {
    const target = (app.settings.digitSizePct / 100) * window.innerHeight;
    digits.style.fontSize = `${target}px`;
    const pad = RING_STROKE * 2 + 24;
    const maxW = stage.clientWidth - pad;
    const maxH = stage.clientHeight - pad - phaseLabel.offsetHeight;
    if (maxW > 0 && maxH > 0) {
      const scale = Math.min(1, maxW / digits.scrollWidth, maxH / digits.offsetHeight);
      if (scale < 1) digits.style.fontSize = `${Math.floor(target * scale)}px`;
    }
    ring.draw(ringBox);
  }

  // --- Loop: rAF while visible, an interval in the background ---
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
    const status = countdown.getStatus();
    if (status === 'running') {
      countdown.pause();
      app.beeper.cancel();
    } else if (status === 'paused') {
      app.beeper.unlock();
      countdown.resume();
      app.beeper.startRun(beeps, countdown.elapsedMs(), countdown.speed);
    }
    render();
  }

  async function requestStop(): Promise<void> {
    const status = countdown.getStatus();
    if (status === 'done') return leave();
    // Pauses while asking, so the timer can't be stopped by accident.
    const wasRunning = status === 'running';
    if (wasRunning) togglePause();
    if (await confirmDialog('Stop this timer and go back to the timers?', 'Stop')) leave();
    else if (wasRunning) togglePause();
  }

  function leave(): void {
    app.go({ name: 'timers' });
  }

  function toggleMute(): void {
    app.updateSettings({ muted: !app.settings.muted });
    render();
  }

  function toggleFullscreen(): void {
    void platformToggleFullscreen().catch(() => undefined);
  }

  // --- Keep the screen awake while the timer runs ---
  let wakeLock: WakeLockSentinel | null = null;
  let nativeAwake = false;
  async function requestWakeLock(): Promise<void> {
    if (countdown.getStatus() === 'done') return;
    if (isNative()) {
      if (!nativeAwake) nativeAwake = await setNativeKeepAwake(true);
      return;
    }
    try {
      if ('wakeLock' in navigator && !wakeLock) {
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
    render();
    if (!document.hidden) void requestWakeLock();
  };
  document.addEventListener('visibilitychange', onVisibility);
  const onResize = () => fit();
  window.addEventListener('resize', onResize);

  // --- Start (inside the Start click, so audio is unlocked) ---
  countdown.start();
  app.beeper.startRun(beeps, 0, countdown.speed);
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
      } else if (e.key === 'Enter' && countdown.getStatus() === 'done') {
        e.preventDefault();
        leave();
      }
    },
    destroy() {
      cancelAnimationFrame(raf);
      clearInterval(bgTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', onResize);
      countdown.stop();
      app.beeper.cancel();
      void releaseWakeLock();
      if (document.fullscreenElement) void document.exitFullscreen?.();
    },
  };
}
