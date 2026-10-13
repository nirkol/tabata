import { Stopwatch, formatStopwatch } from '../timers/stopwatch';
import { isNative, setNativeKeepAwake } from '../platform/native';
import type { App, Screen } from './app';
import { h } from './dom';

/** How often the display refreshes when the window is hidden (rAF doesn't run then). */
const BACKGROUND_TICK_MS = 250;
const NAV_LOCK = 'Pause or stop the stopwatch first';

/**
 * The Stopwatch page (SPEC §5c): counts up from 00:00:00. Start/Pause/Resume, Reset and Stop.
 * While it runs the top navigation is locked. Paused (or stopped), the user can switch to other
 * pages; the stopwatch is kept and shown again, as it was, when they come back.
 */
export function stopwatchScreen(app: App): Screen {
  const watch = new Stopwatch(() => performance.now(), app.speed);

  const label = h('div', { class: 'sw-label', 'data-testid': 'sw-label' });
  const digits = h('div', { class: 'sw-digits', 'data-testid': 'sw-digits' }, '00:00:00');
  const mainBtn = h('button', { type: 'button', class: 'btn btn-run btn-primary', 'data-testid': 'sw-start', onclick: () => toggle() });
  const resetBtn = h('button', { type: 'button', class: 'btn btn-run', 'data-testid': 'sw-reset', onclick: () => reset() }, '↺ RESET');
  const stopBtn = h('button', { type: 'button', class: 'btn btn-run', 'data-testid': 'sw-stop', onclick: () => stop() }, '■ STOP');

  const el = h(
    'section',
    { class: 'stopwatch-screen', 'data-testid': 'stopwatch-screen' },
    h('div', { class: 'screen-header' }, h('h1', { class: 'list-title' }, 'Stopwatch')),
    h('div', { class: 'sw-stage' }, label, h('div', { class: 'sw-box' }, digits)),
    h('div', { class: 'run-controls sw-controls' }, mainBtn, resetBtn, stopBtn),
    h('p', { class: 'hint sw-hint' }, h('kbd', {}, 'Space'), ' start / pause · ', h('kbd', {}, 'R'), ' reset · ', h('kbd', {}, 'Esc'), ' stop'),
  );
  if (app.speed !== 1) el.prepend(h('div', { class: 'speed-badge' }, `×${app.speed} speed (dev)`));

  let lastStatus = '';
  function render(): void {
    const status = watch.getStatus();
    const text = formatStopwatch(watch.elapsedMs());
    if (digits.textContent !== text) digits.textContent = text;
    if (status === lastStatus) return;
    lastStatus = status;
    el.dataset.status = status;
    label.textContent = { idle: 'READY', running: 'RUNNING', paused: 'PAUSED', stopped: 'STOPPED' }[status];
    mainBtn.textContent = status === 'running' ? 'PAUSE' : status === 'paused' ? '▶ RESUME' : '▶ START';
    resetBtn.disabled = status === 'idle';
    stopBtn.disabled = status === 'idle' || status === 'stopped';
    // Running: pause or stop it before leaving the page.
    app.setNavLock(status === 'running' ? NAV_LOCK : null);
    if (status === 'running') void keepAwake(true);
    else void keepAwake(false);
  }

  function toggle(): void {
    if (watch.getStatus() === 'running') watch.pause();
    else watch.start();
    render();
  }
  function reset(): void {
    watch.reset();
    render();
  }
  function stop(): void {
    watch.stop();
    render();
  }

  // --- Keep the screen awake while it runs ---
  let wakeLock: WakeLockSentinel | null = null;
  let nativeAwake = false;
  async function keepAwake(on: boolean): Promise<void> {
    if (isNative()) {
      if (on !== nativeAwake) {
        nativeAwake = on;
        await setNativeKeepAwake(on);
      }
      return;
    }
    try {
      if (on && !wakeLock && 'wakeLock' in navigator) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => (wakeLock = null));
      } else if (!on && wakeLock) {
        const lock = wakeLock;
        wakeLock = null;
        await lock.release();
      }
    } catch {
      // Not supported or not allowed; the stopwatch still works.
    }
  }

  // --- Loop (only while the page is shown) ---
  let raf = 0;
  let bgTimer: ReturnType<typeof setInterval> | undefined;
  let attached = false;
  const frame = () => {
    if (!attached) return;
    render();
    if (watch.getStatus() === 'running') document.title = `${digits.textContent} – Stopwatch`;
    raf = requestAnimationFrame(frame);
  };
  function attach(): void {
    if (attached) return;
    attached = true;
    bgTimer = setInterval(() => {
      if (document.hidden) render();
    }, BACKGROUND_TICK_MS);
    raf = requestAnimationFrame(frame);
  }
  function detach(): void {
    if (!attached) return;
    attached = false;
    cancelAnimationFrame(raf);
    clearInterval(bgTimer);
  }
  attach();
  render();

  return {
    el,
    session: 'stopwatch',
    // A paused or stopped time is kept when the user goes to another page.
    keepAlive: () => watch.getStatus() === 'paused' || watch.getStatus() === 'stopped',
    hide() {
      detach();
      void keepAwake(false);
      document.title = 'yFit Workout Timer';
    },
    show() {
      lastStatus = ''; // re-applies the navigation lock and labels
      render();
      attach();
    },
    onKey(e) {
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        toggle();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        if (watch.getStatus() !== 'idle') reset();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        stop();
      }
    },
    destroy() {
      detach();
      void keepAwake(false);
      document.title = 'yFit Workout Timer';
    },
  };
}
