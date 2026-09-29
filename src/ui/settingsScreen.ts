import { DEFAULT_SETTINGS, SETTINGS_LIMITS, isReddish } from '../storage/storage';
import type { App, Screen } from './app';
import { confirmDialog } from './dialog';
import { h } from './dom';
import { createNumberInput } from './numberInput';

const COLOR_PRESETS = ['#FFFFFF', '#FFD60A', '#30D158', '#64D2FF', '#0A84FF', '#BF5AF2'];

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
    const test = h('button', { type: 'button', class: 'btn', 'data-testid': sound === 'work' ? 'test-beep' : 'test-beep-rest', onclick: () => app.beeper.test(sound) }, '🔊 Test');
    // Compact layout: the slider and Test button sit on the same row as the − / + control.
    input.el.querySelector('.stepper')!.append(slider, test);
    return input.el;
  }
  const workVolume = volumeRow('volume', 'work', 'Work beep volume');
  const restVolume = volumeRow('restVolume', 'rest', 'Rest beep volume (Get Ready, Rest, Rest between sets)');

  const mute = h('input', { type: 'checkbox', class: 'toggle', id: 'mute-toggle', 'data-testid': 'mute-toggle' });
  mute.checked = app.settings.muted;
  mute.addEventListener('change', () => app.updateSettings({ muted: mute.checked }));

  // --- Digit color: picker + presets, red is reserved ---
  const colorError = h('div', { class: 'field-error', 'data-testid': 'color-error' });
  const colorInput = h('input', { type: 'color', class: 'color-input', id: 'color-input', 'data-testid': 'color-input' });
  colorInput.value = app.settings.digitColor.toLowerCase();
  const swatches = h('div', { class: 'swatches' });
  function setColor(hex: string): boolean {
    if (isReddish(hex)) {
      colorError.textContent = 'Red is reserved for the last 5 seconds. Please pick another color.';
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
          'aria-label': `Digit color ${c}`,
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
          h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'color-input' }, 'Counter digit color'), h('div', { class: 'row' }, colorInput, swatches), colorError),
          size.el,
        ),
        preview,
      ),
    ),
  );
  return { el };
}
