import { DEFAULT_SETTINGS, SETTINGS_LIMITS, exportData, importData, isReddish } from '../storage/storage';
import type { App, Screen } from './app';
import { confirmDialog } from './dialog';
import { h } from './dom';
import { createNumberInput } from './numberInput';

const COLOR_PRESETS = ['#FFFFFF', '#FFD60A', '#30D158', '#64D2FF', '#0A84FF', '#BF5AF2'];

/** Settings / admin screen (SPEC §6). */
export function settingsScreen(app: App): Screen {
  // --- Beep volume: number control + slider + Test beep ---
  const volumeSlider = h('input', { type: 'range', class: 'slider', min: 0, max: 100, step: 1, 'aria-label': 'Beep volume slider', 'data-testid': 'volume-slider' });
  const volume = createNumberInput({
    name: 'volume',
    label: 'Beep volume',
    kind: 'int',
    value: Math.round(app.settings.volume * 100),
    range: SETTINGS_LIMITS.volumePct,
    step: 5,
    suffix: '%',
    onChange: (v) => {
      if (v === null) return;
      volumeSlider.value = String(v);
      app.updateSettings({ volume: v / 100 });
    },
  });
  volumeSlider.value = String(Math.round(app.settings.volume * 100));
  volumeSlider.addEventListener('input', () => {
    const v = Number(volumeSlider.value);
    volume.setValue(v);
    app.updateSettings({ volume: v / 100 });
  });
  const testBeep = h('button', { type: 'button', class: 'btn', 'data-testid': 'test-beep', onclick: () => app.beeper.test() }, '🔊 Test beep');

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

  // --- Data: export / import ---
  const importMsg = h('div', { class: 'import-msg', 'data-testid': 'import-msg' });
  const fileInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true, 'data-testid': 'import-file' });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const { routines, skipped } = importData(await file.text());
      app.saveRoutines([...app.routines, ...routines]);
      importMsg.textContent = `Imported ${routines.length} routine${routines.length === 1 ? '' : 's'}` + (skipped ? ` (${skipped} invalid skipped).` : '.');
      importMsg.classList.remove('error');
    } catch (err) {
      importMsg.textContent = (err as Error).message;
      importMsg.classList.add('error');
    }
  });
  function doExport(): void {
    const blob = new Blob([exportData(app.routines, app.settings)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: 'tabata-routines.json' });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function reset(): Promise<void> {
    if (!(await confirmDialog('Reset all settings to their defaults? Routines are not affected.', 'Reset'))) return;
    app.updateSettings(DEFAULT_SETTINGS);
    app.go({ name: 'settings' });
  }

  const el = h(
    'section',
    { class: 'settings-screen' },
    h('div', { class: 'screen-header' }, h('h1', {}, 'Settings')),
    h(
      'div',
      { class: 'panel' },
      h('h2', {}, 'Sound'),
      volume.el,
      h('div', { class: 'row' }, volumeSlider, testBeep),
      h('label', { class: 'toggle-row', for: 'mute-toggle' }, mute, h('span', {}, 'Mute all beeps')),
    ),
    h(
      'div',
      { class: 'panel' },
      h('h2', {}, 'Counter display'),
      h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'color-input' }, 'Counter digit color'), h('div', { class: 'row' }, colorInput, swatches), colorError),
      size.el,
      sizeSlider,
      preview,
    ),
    h(
      'div',
      { class: 'panel' },
      h('h2', {}, 'Data'),
      h('p', { class: 'hint' }, 'Export your routines to a file as a backup, or import them from a file (for example into the Mac app).'),
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn', 'data-testid': 'export', onclick: doExport }, 'Export routines'), h('button', { type: 'button', class: 'btn', 'data-testid': 'import', onclick: () => fileInput.click() }, 'Import routines'), fileInput),
      importMsg,
    ),
    h('div', { class: 'form-actions' }, h('button', { type: 'button', class: 'btn btn-danger-outline', 'data-testid': 'reset-settings', onclick: () => void reset() }, 'Reset to defaults')),
  );
  return { el };
}
