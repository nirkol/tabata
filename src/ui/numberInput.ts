import { rangeMessage, type Range } from '../routines/model';
import { formatClock, parseInteger, parseTime } from '../timer/format';
import { h } from './dom';

export interface NumberInputOptions {
  /** Used for element ids and test ids. */
  name: string;
  label: string;
  value: number;
  range: Range;
  kind: 'time' | 'int';
  /** Value change per click (default 1). */
  step?: number;
  /** Larger step used after holding a button for HOLD_BIG_STEP_MS (time fields: 5 s). */
  holdStep?: number;
  /** Unit shown after the field, e.g. "%". */
  suffix?: string;
  disabled?: boolean;
  /** Called with the new value, or null while the typed text is invalid. */
  onChange: (value: number | null) => void;
}

export interface NumberInput {
  el: HTMLElement;
  /** Current valid value, or null while the typed text is invalid. */
  value(): number | null;
  setValue(value: number): void;
  setDisabled(disabled: boolean): void;
}

/** Delay before a held button starts repeating. */
export const HOLD_DELAY_MS = 400;
/** Repeat interval while holding; it speeds up after HOLD_FAST_AFTER_MS (SPEC §5.3). */
export const HOLD_REPEAT_MS = 150;
export const HOLD_FAST_REPEAT_MS = 50;
export const HOLD_FAST_AFTER_MS = 1000;
/** After this long, time fields switch to their larger hold step. */
export const HOLD_BIG_STEP_MS = 2000;

/** The shared "[ − ] [ value ] [ + ]" control (SPEC §5.3). */
export function createNumberInput(opts: NumberInputOptions): NumberInput {
  const step = opts.step ?? 1;
  const holdStep = opts.holdStep ?? step;
  const { min, max } = opts.range;
  const isTime = opts.kind === 'time';
  const format = (v: number) => (isTime ? formatClock(v) : String(v));
  const parse = (t: string) => (isTime ? parseTime(t) : parseInteger(t));
  const allowed = isTime ? /[^0-9:]/g : /[^0-9]/g;

  let committed = opts.value;
  let current: number | null = opts.value;
  let disabled = !!opts.disabled;

  const errorId = `${opts.name}-error`;
  const input = h('input', {
    id: `${opts.name}-input`,
    class: 'stepper-value',
    type: 'text',
    inputmode: isTime ? 'text' : 'numeric',
    autocomplete: 'off',
    'aria-describedby': errorId,
    'data-testid': `${opts.name}-input`,
  });
  input.value = format(committed);
  const minus = h('button', { type: 'button', class: 'stepper-btn', 'aria-label': `Decrease ${opts.label}`, 'data-testid': `${opts.name}-minus` }, '−');
  const plus = h('button', { type: 'button', class: 'stepper-btn', 'aria-label': `Increase ${opts.label}`, 'data-testid': `${opts.name}-plus` }, '+');
  const error = h('div', { id: errorId, class: 'field-error', 'aria-live': 'polite', 'data-testid': `${opts.name}-error` });
  const el = h(
    'div',
    { class: 'field', 'data-testid': `${opts.name}-field` },
    h('label', { class: 'field-label', for: input.id }, opts.label),
    h('div', { class: 'stepper' }, minus, input, plus, opts.suffix ? h('span', { class: 'stepper-suffix' }, opts.suffix) : null),
    error,
  );

  function refresh(): void {
    const base = current ?? committed;
    el.classList.toggle('disabled', disabled);
    input.disabled = disabled;
    minus.disabled = disabled || base <= min;
    plus.disabled = disabled || base >= max;
  }

  function showError(message: string): void {
    error.textContent = message;
    input.classList.toggle('invalid', message !== '');
  }

  /** Validates the typed text; returns the value or null. */
  function evaluate(): number | null {
    const parsed = parse(input.value);
    if (parsed === null) {
      showError(isTime ? 'Enter a time like 1:30, or seconds like 90' : 'Enter a whole number');
      return null;
    }
    if (parsed < min || parsed > max) {
      showError(rangeMessage(opts.range, isTime));
      return null;
    }
    showError('');
    return parsed;
  }

  function set(value: number, notify = true): void {
    const v = Math.min(max, Math.max(min, value));
    committed = v;
    current = v;
    input.value = format(v);
    showError('');
    refresh();
    if (notify) opts.onChange(v);
  }

  function stepBy(delta: number): boolean {
    const base = current ?? committed;
    const next = Math.min(max, Math.max(min, base + delta));
    if (next === base && current !== null) return false;
    set(next);
    return next > min && next < max;
  }

  // Typing: reject non-numeric characters, validate live.
  input.addEventListener('input', () => {
    const cleaned = input.value.replace(allowed, '');
    if (cleaned !== input.value) {
      const pos = Math.max(0, (input.selectionStart ?? cleaned.length) - (input.value.length - cleaned.length));
      input.value = cleaned;
      input.setSelectionRange(pos, pos);
    }
    current = evaluate();
    refresh();
    opts.onChange(current);
  });
  const commit = () => {
    const v = evaluate();
    if (v !== null) set(v);
  };
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      set(committed);
      input.select();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      stepBy(e.key === 'ArrowUp' ? step : -step);
    }
  });

  // − / + buttons with press-and-hold repeat.
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  const stopHold = () => {
    if (holdTimer !== null) clearTimeout(holdTimer);
    holdTimer = null;
  };
  const startHold = (dir: 1 | -1) => {
    stopHold();
    const startedAt = performance.now();
    if (!stepBy(dir * step)) return;
    const tick = () => {
      const held = performance.now() - startedAt;
      if (!stepBy(dir * (held >= HOLD_BIG_STEP_MS ? holdStep : step))) {
        holdTimer = null;
        return;
      }
      holdTimer = setTimeout(tick, held >= HOLD_FAST_AFTER_MS ? HOLD_FAST_REPEAT_MS : HOLD_REPEAT_MS);
    };
    holdTimer = setTimeout(tick, HOLD_DELAY_MS);
  };
  for (const [btn, dir] of [
    [minus, -1],
    [plus, 1],
  ] as const) {
    btn.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || btn.disabled) return;
      e.preventDefault(); // keep focus where it is, no text selection
      btn.setPointerCapture?.(e.pointerId);
      startHold(dir);
    });
    btn.addEventListener('pointerup', stopHold);
    btn.addEventListener('pointercancel', stopHold);
    btn.addEventListener('lostpointercapture', stopHold);
    // Keyboard activation (Enter/Space) fires a click with detail 0; pointer clicks are handled above.
    btn.addEventListener('click', (e) => {
      if (e.detail === 0) stepBy(dir * step);
    });
  }

  refresh();
  return {
    el,
    value: () => current,
    setValue: (v) => set(v, false),
    setDisabled: (d) => {
      disabled = d;
      if (d) {
        stopHold();
        // A disabled field keeps its last valid value.
        set(committed, false);
      }
      refresh();
    },
  };
}
