// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNumberInput, type NumberInputOptions } from './numberInput';

function setup(overrides: Partial<NumberInputOptions> = {}) {
  const onChange = vi.fn();
  const input = createNumberInput({
    name: 'rest',
    label: 'Rest time',
    kind: 'time',
    value: 10,
    range: { min: 1, max: 180 },
    step: 1,
    holdStep: 5,
    onChange,
    ...overrides,
  });
  document.body.replaceChildren(input.el);
  const q = (id: string) => input.el.querySelector(`[data-testid="rest-${id}"]`) as HTMLInputElement & HTMLButtonElement;
  return { input, onChange, text: q('input'), minus: q('minus'), plus: q('plus'), error: q('error') };
}

function press(btn: HTMLElement) {
  btn.dispatchEvent(new MouseEvent('pointerdown', { button: 0, bubbles: true }));
}
function release(btn: HTMLElement) {
  btn.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
}
function type(el: HTMLInputElement, value: string) {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
function key(el: HTMLElement, k: string) {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
}

describe('number input (SPEC §5.3)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('steps by 1 per click', () => {
    const { text, plus, minus, onChange } = setup();
    press(plus);
    release(plus);
    expect(text.value).toBe('0:11');
    press(minus);
    release(minus);
    press(minus);
    release(minus);
    expect(text.value).toBe('0:09');
    expect(onChange).toHaveBeenLastCalledWith(9);
  });

  it('repeats while held, speeds up after 1 s, and uses 5 s steps after 2 s', () => {
    const { input, plus } = setup({ value: 1 });
    press(plus); // 2
    vi.advanceTimersByTime(399);
    expect(input.value()).toBe(2);
    vi.advanceTimersByTime(1); // first repeat at 400 ms → 3
    expect(input.value()).toBe(3);
    // Until ~1 s: repeats every 150 ms (550, 700, 850, 1000)
    vi.advanceTimersByTime(600);
    const atOneSecond = input.value()!;
    expect(atOneSecond).toBe(7);
    // 1–2 s: every 50 ms with step 1 → about 20 more
    vi.advanceTimersByTime(1000);
    const atTwoSeconds = input.value()!;
    expect(atTwoSeconds - atOneSecond).toBeGreaterThanOrEqual(18);
    // After 2 s: step 5 every 50 ms
    vi.advanceTimersByTime(100);
    expect(input.value()! - atTwoSeconds).toBe(10);
    release(plus);
    const stopped = input.value();
    vi.advanceTimersByTime(1000);
    expect(input.value()).toBe(stopped);
  });

  it('stops at the limit and disables the button', () => {
    const { input, plus, minus } = setup({ value: 178 });
    press(plus);
    vi.advanceTimersByTime(5000);
    release(plus);
    expect(input.value()).toBe(180);
    expect(plus.disabled).toBe(true);
    expect(minus.disabled).toBe(false);
  });

  it('accepts typed m:ss or seconds and reformats on Enter', () => {
    const { text, onChange } = setup();
    type(text, '90');
    expect(onChange).toHaveBeenLastCalledWith(90);
    key(text, 'Enter');
    expect(text.value).toBe('1:30');
    type(text, '2:05');
    text.dispatchEvent(new Event('blur'));
    expect(text.value).toBe('2:05');
  });

  it('shows the range error for out-of-range values and reports null', () => {
    const { text, error, onChange } = setup();
    type(text, '3:01');
    expect(error.textContent).toBe('Must be between 0:01 and 3:00');
    expect(onChange).toHaveBeenLastCalledWith(null);
    key(text, 'Enter');
    expect(text.value).toBe('3:01'); // stays so the user can fix it
  });

  it('rejects non-numeric characters', () => {
    const { text } = setup();
    type(text, '1a:3b0');
    expect(text.value).toBe('1:30');
  });

  it('Esc restores the previous value', () => {
    const { text, error, onChange } = setup();
    type(text, '999');
    key(text, 'Escape');
    expect(text.value).toBe('0:10');
    expect(error.textContent).toBe('');
    expect(onChange).toHaveBeenLastCalledWith(10);
  });

  it('integer fields', () => {
    const { text, error } = setup({ kind: 'int', value: 8, range: { min: 1, max: 20 } });
    type(text, '21');
    expect(error.textContent).toBe('Must be between 1 and 20');
    type(text, '20');
    expect(error.textContent).toBe('');
  });

  it('can be disabled', () => {
    const { input, text, plus, minus } = setup();
    input.setDisabled(true);
    expect(text.disabled && plus.disabled && minus.disabled).toBe(true);
  });
});
