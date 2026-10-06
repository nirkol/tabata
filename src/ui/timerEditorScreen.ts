import { TIMER_LIMITS, createTimer, isValidDuration } from '../timers/model';
import { formatClock } from '../timer/format';
import type { App, Screen } from './app';
import { h } from './dom';
import { createNumberInput } from './numberInput';

/** Timer editor (SPEC §5b). `timerId` null creates a new timer. */
export function timerEditorScreen(app: App, timerId: string | null): Screen {
  const existing = timerId ? app.timers.find((t) => t.id === timerId) : undefined;
  const initial = existing?.durationSec ?? 60;
  let minutes: number | null = Math.floor(initial / 60);
  let seconds: number | null = initial % 60;

  const total = h('div', { class: 'total-preview', 'data-testid': 'timer-total' });
  const error = h('div', { class: 'field-error', 'data-testid': 'timer-error' });
  const save = h('button', { type: 'button', class: 'btn btn-primary', 'data-testid': 'save', onclick: () => doSave() }, 'Save');

  const minutesInput = createNumberInput({
    name: 'minutes',
    label: 'Minutes',
    kind: 'int',
    value: minutes,
    range: TIMER_LIMITS.minutes,
    holdStep: 5,
    onChange: (v) => {
      minutes = v;
      update();
    },
  });
  const secondsInput = createNumberInput({
    name: 'seconds',
    label: 'Seconds',
    kind: 'int',
    value: seconds,
    range: TIMER_LIMITS.seconds,
    holdStep: 5,
    onChange: (v) => {
      seconds = v;
      update();
    },
  });

  const durationSec = () => (minutes === null || seconds === null ? null : minutes * 60 + seconds);

  function update(): void {
    const d = durationSec();
    const valid = d !== null && isValidDuration(d);
    total.textContent = d === null ? 'Duration: –' : `Duration: ${formatClock(d)}`;
    error.textContent = d !== null && !valid ? `Must be between ${formatClock(TIMER_LIMITS.durationSec.min)} and ${formatClock(TIMER_LIMITS.durationSec.max)}` : '';
    save.disabled = !valid;
  }

  function doSave(): void {
    const d = durationSec();
    if (d === null || !isValidDuration(d)) return;
    if (existing) {
      app.saveTimers(app.timers.map((t) => (t.id === existing.id ? { ...t, durationSec: d, updatedAt: new Date().toISOString() } : t)));
    } else {
      app.saveTimers([...app.timers, createTimer(d)]);
    }
    app.go({ name: 'timers' });
  }

  const el = h(
    'section',
    { class: 'editor-screen' },
    h('div', { class: 'screen-header' }, h('h1', {}, existing ? 'Edit Timer' : 'New Timer')),
    h(
      'form',
      { class: 'editor-form', onsubmit: (e: Event) => e.preventDefault() },
      minutesInput.el,
      secondsInput.el,
      h('div', { class: 'field total-field field-wide' }, total, error),
      h(
        'div',
        { class: 'form-actions field-wide' },
        h('button', { type: 'button', class: 'btn', 'data-testid': 'cancel', onclick: () => app.go({ name: 'timers' }) }, 'Cancel'),
        save,
      ),
    ),
  );
  update();
  queueMicrotask(() => minutesInput.el.querySelector('input')?.focus());
  return { el, lockNav: 'Save or cancel the timer first' };
}
