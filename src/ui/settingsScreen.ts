import { BEEP_STYLES, BEEP_STYLE_LABELS, type BeepStyle } from '../audio/beeper';
import { DEFAULT_SETTINGS, PRAISE_MAX_LENGTH, SETTINGS_LIMITS, isReddish, pickPraise } from '../storage/storage';
import type { App, Screen } from './app';
import { confirmDialog } from './dialog';
import { h } from './dom';
import { createNumberInput } from './numberInput';
import { sayCue, sayText } from '../platform/voice';

const COLOR_PRESETS = ['#30D158', '#FFFFFF', '#FFD60A', '#64D2FF', '#0A84FF', '#BF5AF2'];

/** Settings / admin screen (SPEC §6). */
export function settingsScreen(app: App): Screen {
  // --- Beep volumes (work and rest): number control + slider + Test button ---
  function volumeRow(key: 'volume' | 'restVolume', sound: 'work' | 'rest', label: string): HTMLElement {
    const slider = h('input', { type: 'range', class: 'slider', min: 0, max: 100, step: 1, 'aria-label': `${label} slider`, 'data-testid': `${key}-slider` });
    const input = createNumberInput({
      name: key,
      label,
      kind: 'int',
      value: Math.round(app.settings[key] * 100),
      range: SETTINGS_LIMITS.volumePct,
      step: 5,
      suffix: '%',
      onChange: (v) => {
        if (v === null) return;
        slider.value = String(v);
        app.updateSettings({ [key]: v / 100 });
      },
    });
    slider.value = String(Math.round(app.settings[key] * 100));
    slider.addEventListener('input', () => {
      const v = Number(slider.value);
      input.setValue(v);
      app.updateSettings({ [key]: v / 100 });
    });
    const styleKey = sound === 'work' ? 'workStyle' : 'restStyle';
    const style = h('select', { class: 'select', 'aria-label': `${label}: sound`, 'data-testid': `${sound}-style` });
    for (const id of BEEP_STYLES) {
      const opt = h('option', { value: id }, BEEP_STYLE_LABELS[id]);
      opt.selected = id === app.settings[styleKey];
      style.append(opt);
    }
    style.addEventListener('change', () => {
      app.updateSettings({ [styleKey]: style.value as BeepStyle });
      app.beeper.test(sound); // let the user hear the new sound right away
    });
    const test = h('button', { type: 'button', class: 'btn', 'data-testid': sound === 'work' ? 'test-beep' : 'test-beep-rest', onclick: () => app.beeper.test(sound) }, '🔊 Test');
    // Compact layout: the slider, sound choice and Test button sit on the same row as the − / + control.
    input.el.querySelector('.stepper')!.append(slider, style, test);
    return input.el;
  }
  const workVolume = volumeRow('volume', 'work', 'Work beeps');
  const restVolume = volumeRow('restVolume', 'rest', 'Rest beeps (Get Ready, Rest, Rest between cycles)');

  const tenCall = h('input', { type: 'checkbox', class: 'toggle', id: 'ten-call', 'data-testid': 'ten-call' });
  tenCall.checked = app.settings.tenCall;
  tenCall.addEventListener('change', () => app.updateSettings({ tenCall: tenCall.checked }));
  const tenTest = h('button', { type: 'button', class: 'btn', 'data-testid': 'test-ten', onclick: () => sayCue('ten', app.settings.muted ? 0 : app.settings.volume) }, '🔊 Test');
  const startCall = h('input', { type: 'checkbox', class: 'toggle', id: 'start-call', 'data-testid': 'start-call' });
  startCall.checked = app.settings.startCall;
  startCall.addEventListener('change', () => app.updateSettings({ startCall: startCall.checked }));
  const startTest = h('button', { type: 'button', class: 'btn', 'data-testid': 'test-start', onclick: () => sayCue('start', app.settings.muted ? 0 : app.settings.volume) }, '🔊 Test');

  // --- Encouragement at the end of each cycle: toggle, test, 10 editable statements ---
  const praiseCall = h('input', { type: 'checkbox', class: 'toggle', id: 'praise-call', 'data-testid': 'praise-call' });
  praiseCall.checked = app.settings.praiseCall;
  praiseCall.addEventListener('change', () => app.updateSettings({ praiseCall: praiseCall.checked }));
  let lastTested: string | null = null;
  const praiseTest = h('button', {
    type: 'button',
    class: 'btn',
    'data-testid': 'test-praise',
    onclick: () => {
      const text = pickPraise(app.settings.praises, lastTested);
      if (!text) return;
      lastTested = text;
      sayText(text, app.settings.muted ? 0 : app.settings.volume);
    },
  }, '🔊 Test');
  const praiseInputs = app.settings.praises.map((text, i) => {
    const input = h('input', {
      type: 'text',
      class: 'text-input praise-input',
      dir: 'auto',
      maxlength: PRAISE_MAX_LENGTH,
      placeholder: '(empty: skipped)',
      'aria-label': `Encouraging statement ${i + 1}`,
      'data-testid': `praise-${i + 1}`,
    });
    input.value = text;
    input.addEventListener('input', () => {
      const next = [...app.settings.praises];
      next[i] = input.value;
      app.updateSettings({ praises: next });
    });
    return h('label', { class: 'praise-item' }, h('span', { class: 'praise-num' }, `${i + 1}`), input);
  });

  const showRemaining = h('input', { type: 'checkbox', class: 'toggle', id: 'show-remaining', 'data-testid': 'show-remaining' });
  showRemaining.checked = app.settings.showRemaining;
  showRemaining.addEventListener('change', () => app.updateSettings({ showRemaining: showRemaining.checked }));

  const mute = h('input', { type: 'checkbox', class: 'toggle', id: 'mute-toggle', 'data-testid': 'mute-toggle' });
  mute.checked = app.settings.muted;
  mute.addEventListener('change', () => app.updateSettings({ muted: mute.checked }));

  // --- Work color: picker + presets; red is reserved for rest ---
  const colorError = h('div', { class: 'field-error', 'data-testid': 'color-error' });
  const colorInput = h('input', { type: 'color', class: 'color-input', id: 'color-input', 'data-testid': 'color-input' });
  colorInput.value = app.settings.digitColor.toLowerCase();
  const swatches = h('div', { class: 'swatches' });
  function setColor(hex: string): boolean {
    if (isReddish(hex)) {
      colorError.textContent = 'Red is reserved for rest. Please pick another color for work.';
      colorInput.value = app.settings.digitColor.toLowerCase();
      return false;
    }
    colorError.textContent = '';
    colorInput.value = hex.toLowerCase();
    app.updateSettings({ digitColor: hex.toUpperCase() });
    renderSwatches();
    return true;
  }
  colorInput.addEventListener('input', () => setColor(colorInput.value));
  function renderSwatches(): void {
    swatches.replaceChildren(
      ...COLOR_PRESETS.map((c) =>
        h('button', {
          type: 'button',
          class: 'swatch' + (c === app.settings.digitColor ? ' active' : ''),
          style: `background:${c}`,
          'aria-label': `Work color ${c}`,
          'data-testid': `swatch-${c.slice(1)}`,
          onclick: () => setColor(c),
        }),
      ),
    );
  }
  renderSwatches();

  // --- Digit size: number control + slider + live preview ---
  const sizeSlider = h('input', { type: 'range', class: 'slider', min: SETTINGS_LIMITS.digitSizePct.min, max: SETTINGS_LIMITS.digitSizePct.max, step: 1, 'aria-label': 'Digit size slider', 'data-testid': 'size-slider' });
  sizeSlider.value = String(app.settings.digitSizePct);
  const size = createNumberInput({
    name: 'digitSize',
    label: 'Counter digit size (% of window height)',
    kind: 'int',
    value: app.settings.digitSizePct,
    range: SETTINGS_LIMITS.digitSizePct,
    step: 5,
    suffix: '%',
    onChange: (v) => {
      if (v === null) return;
      sizeSlider.value = String(v);
      app.updateSettings({ digitSizePct: v });
    },
  });
  sizeSlider.addEventListener('input', () => {
    const v = Number(sizeSlider.value);
    size.setValue(v);
    app.updateSettings({ digitSizePct: v });
  });
  // The preview box stands for the whole window, so digits take the same share of its height.
  const preview = h('div', { class: 'size-preview', 'data-testid': 'size-preview' }, h('span', { class: 'preview-digits' }, '0:20'));

  async function reset(): Promise<void> {
    if (!(await confirmDialog('Reset all settings to their defaults? Routines are not affected.', 'Reset'))) return;
    app.updateSettings(DEFAULT_SETTINGS);
    app.go({ name: 'settings' });
  }

  // Compact layout: each slider sits on the same row as its − / + control.
  size.el.querySelector('.stepper')!.append(sizeSlider);

  const el = h(
    'section',
    { class: 'settings-screen' },
    h(
      'div',
      { class: 'screen-header' },
      h('h1', {}, 'Settings'),
      h('button', { type: 'button', class: 'btn btn-danger-outline', 'data-testid': 'reset-settings', onclick: () => void reset() }, 'Reset to defaults'),
    ),
    h(
      'div',
      { class: 'panel' },
      h('div', { class: 'row' }, h('h2', {}, 'Sound'), h('label', { class: 'toggle-row', for: 'mute-toggle' }, mute, h('span', {}, 'Mute all beeps'))),
      workVolume,
      restVolume,
      h('div', { class: 'row' }, h('label', { class: 'toggle-row', for: 'start-call' }, startCall, h('span', {}, 'Voice “Start!” at the start of each work period')), startTest),
      h('div', { class: 'row' }, h('label', { class: 'toggle-row', for: 'ten-call' }, tenCall, h('span', {}, 'Voice “Ten!” 10 seconds before the end of each work period')), tenTest),
    ),
    h(
      'div',
      { class: 'panel' },
      h('h2', {}, 'Counter display'),
      h(
        'div',
        { class: 'display-grid' },
        h(
          'div',
          { class: 'display-controls' },
          h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'color-input' }, 'Work color'), h('div', { class: 'row' }, colorInput, swatches), colorError),
          h('p', { class: 'hint color-note' }, 'Rest and Get Ready are always shown in ', h('span', { class: 'dot dot-rest' }), 'red.'),
          size.el,
          h('label', { class: 'toggle-row', for: 'show-remaining' }, showRemaining, h('span', {}, 'Show “Cycle remaining” and “Total remaining” during the workout')),
        ),
        preview,
      ),
    ),
    h(
      'div',
      { class: 'panel' },
      h('div', { class: 'row' }, h('h2', {}, 'Encouragement'), h('label', { class: 'toggle-row', for: 'praise-call' }, praiseCall, h('span', {}, 'Say one of these (at random) at the end of each cycle')), praiseTest),
      h('div', { class: 'praise-grid' }, ...praiseInputs),
    ),
  );
  return { el };
}
