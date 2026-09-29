import { expect, test, type Page } from '@playwright/test';

/**
 * Records every beep the app schedules: wraps OscillatorNode.start so tests can
 * check timing and count beeps without listening to audio.
 */
async function instrumentAudio(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __beeps: { at: number; ctxNow: number }[] };
    w.__beeps = [];
    const origStart = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (when?: number) {
      const ctx = this.context as AudioContext;
      w.__beeps.push({ at: when ?? 0, ctxNow: ctx.currentTime });
      return origStart.call(this, when);
    };
  });
}

async function fresh(page: Page, query = '') {
  await page.goto('/' + query);
  await page.evaluate(() => localStorage.clear());
  await page.goto('/' + query);
}

test('first launch shows the sample routine', async ({ page }) => {
  await fresh(page);
  await expect(page.getByTestId('routine-card')).toHaveCount(1);
  await expect(page.getByTestId('routine-name')).toHaveText('Classic Tabata');
  await expect(page.getByTestId('routine-card')).toContainText('20s / 10s × 8 × 1 set');
  await expect(page.getByTestId('routine-card')).toContainText('Total 3:55');
});

test('smoke: create a routine, run it, pause, resume and finish (speed flag)', async ({ page }) => {
  await instrumentAudio(page);
  await fresh(page, '?speed=20');

  // Create: default name, typed values and − / + buttons.
  await page.getByTestId('new-routine').click();
  await expect(page.getByTestId('name-input')).toHaveValue('Routine 1');
  await page.getByTestId('name-input').fill('Smoke');
  await page.getByTestId('workSec-input').fill('15');
  await page.getByTestId('workSec-input').press('Enter');
  await expect(page.getByTestId('workSec-input')).toHaveValue('0:15');
  await page.getByTestId('restSec-input').fill('0:05');
  await page.getByTestId('intervals-input').fill('3');
  await expect(page.getByTestId('setRestSec-input')).toBeDisabled();
  await page.getByTestId('sets-plus').click();
  await expect(page.getByTestId('sets-input')).toHaveValue('2');
  await expect(page.getByTestId('setRestSec-input')).toBeEnabled();
  await page.getByTestId('setRestSec-input').fill('20');
  // 5 + 2×(3×15 + 2×5) + 20 = 135 s
  await expect(page.getByTestId('total-preview')).toHaveText('Total: 2:15');
  await page.getByTestId('save').click();

  const card = page.getByTestId('routine-card').filter({ hasText: 'Smoke' });
  await expect(card).toHaveClass(/selected/);
  await expect(card).toContainText('15s / 5s × 3 × 2 sets');

  // Survives reload.
  await page.reload();
  await expect(page.getByTestId('routine-card').filter({ hasText: 'Smoke' })).toBeVisible();

  // Run.
  await page.getByTestId('routine-card').filter({ hasText: 'Smoke' }).getByTestId('start').click();
  await expect(page.getByTestId('run-screen')).toBeVisible();
  await expect(page.getByTestId('run-set')).toHaveText('Set 1 / 2');
  await expect(page.getByTestId('run-phase')).toHaveText('WORK', { timeout: 5000 });
  await expect(page.getByTestId('run-intervals')).toHaveText('Intervals left: 3 / 3');
  await expect(page.getByTestId('run-set-info')).toHaveText('Set 1 / 2');
  await expect(page.getByTestId('run-set-remaining')).toContainText('Set remaining: ');

  // Pause: the display freezes.
  await page.keyboard.press('Space');
  await expect(page.getByTestId('pause')).toHaveText('▶ RESUME');
  const frozen = await page.getByTestId('run-digits').textContent();
  await page.waitForTimeout(1000); // = 20 s of run time at ×20
  await expect(page.getByTestId('run-digits')).toHaveText(frozen!);
  await expect(page).toHaveTitle(/\(paused\)/);

  // Resume and let it finish.
  await page.getByTestId('pause').click();
  await expect(page.getByTestId('pause')).toHaveText('PAUSE');
  await expect(page.getByTestId('run-phase')).toHaveText('SET REST', { timeout: 10000 });
  await expect(page.getByTestId('run-set')).toHaveText('Set 1 / 2');
  await expect(page.getByTestId('run-set-info')).toHaveText('Set 2 / 2', { timeout: 10000 });
  await expect(page.getByTestId('run-phase')).toHaveText('DONE', { timeout: 15000 });
  await expect(page.getByTestId('run-digits')).toHaveText('0:00');
  await expect(page).toHaveTitle('DONE – Tabata');

  const beeps = await page.evaluate(() => (window as unknown as { __beeps: unknown[] }).__beeps.length);
  expect(beeps).toBeGreaterThan(0);

  // Start over runs the same routine again from Get Ready.
  await expect(page.getByTestId('start-over')).toBeVisible();
  await expect(page.getByTestId('pause')).toBeHidden();
  await page.getByTestId('start-over').click();
  await expect(page.getByTestId('run-phase')).toHaveText(/GET READY|WORK/);
  await expect(page.getByTestId('run-set')).toHaveText('Set 1 / 2');
  await expect(page.getByTestId('start-over')).toBeHidden();
  await expect(page.getByTestId('pause')).toBeVisible();
  await expect(page.getByTestId('run-phase')).toHaveText('DONE', { timeout: 15000 });

  await page.getByTestId('stop').click();
  await expect(page.getByTestId('routine-list')).toBeVisible();
});

test('stop asks for confirmation', async ({ page }) => {
  await fresh(page);
  await page.getByTestId('start').click();
  await page.keyboard.press('Escape');
  await page.getByTestId('confirm-no').click();
  await expect(page.getByTestId('run-screen')).toBeVisible();
  await page.getByTestId('stop').click();
  await page.getByTestId('confirm-yes').click();
  await expect(page.getByTestId('routine-list')).toBeVisible();
});

test('last 5 seconds: digits and ring turn red', async ({ page }) => {
  await fresh(page);
  await page.getByTestId('start').click();
  // Get Ready is 5 s long, so it is red from the start.
  await expect(page.getByTestId('run-phase')).toHaveText('GET READY');
  await expect(page.getByTestId('run-screen')).toHaveClass(/warning/);
  const red = 'rgb(255, 59, 48)';
  await expect(page.getByTestId('run-digits')).toHaveCSS('color', red);
  await expect(page.getByTestId('run-ring')).toHaveCSS('stroke', red);
  // Work (20 s) starts in the normal color.
  await expect(page.getByTestId('run-phase')).toHaveText('WORK', { timeout: 7000 });
  await expect(page.getByTestId('run-digits')).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(page.getByTestId('run-screen')).not.toHaveClass(/warning/);
});

test('editor: validation, press-and-hold and typed values', async ({ page }) => {
  await fresh(page);
  await page.getByTestId('new-routine').click();

  await page.getByTestId('restSec-input').fill('3:01');
  await expect(page.getByTestId('restSec-error')).toHaveText('Must be between 0:01 and 3:00');
  await expect(page.getByTestId('save')).toBeDisabled();
  await page.getByTestId('restSec-input').press('Escape');
  await expect(page.getByTestId('restSec-input')).toHaveValue('0:10');
  await expect(page.getByTestId('save')).toBeEnabled();

  await page.getByTestId('intervals-input').fill('21');
  await expect(page.getByTestId('intervals-error')).toHaveText('Must be between 1 and 20');
  await expect(page.getByTestId('save')).toBeDisabled();
  await page.getByTestId('intervals-input').fill('20');
  await expect(page.getByTestId('save')).toBeEnabled();

  // Press and hold + on Work (starts at 0:20).
  const plus = page.getByTestId('workSec-plus');
  await plus.hover();
  await page.mouse.down();
  await page.waitForTimeout(2600);
  await page.mouse.up();
  const value = await page.getByTestId('workSec-input').inputValue();
  const [m, s] = value.split(':').map(Number);
  expect(m * 60 + s).toBeGreaterThan(20 + 30); // many repeated steps, 5 s steps at the end

  // Minus is disabled at the minimum.
  await page.getByTestId('sets-input').fill('1');
  await expect(page.getByTestId('sets-minus')).toBeDisabled();

  await page.getByTestId('name-input').fill('');
  await expect(page.getByTestId('name-error')).toHaveText('Name is required');
  await expect(page.getByTestId('save')).toBeDisabled();
});

test('routines: edit, delete and default names', async ({ page }) => {
  await fresh(page);
  const cards = page.getByTestId('routine-card');

  await page.getByTestId('new-routine').click();
  await page.getByTestId('save').click();
  await page.getByTestId('new-routine').click();
  await expect(page.getByTestId('name-input')).toHaveValue('Routine 2');
  await page.getByTestId('cancel').click();
  await expect(cards).toHaveCount(2);

  await cards.nth(1).getByTestId('edit').click();
  await page.getByTestId('name-input').fill('Renamed');
  await page.getByTestId('save').click();
  await expect(cards.nth(1).getByTestId('routine-name')).toHaveText('Renamed');

  await expect(cards.first().getByTestId('duplicate')).toHaveCount(0);

  await cards.nth(1).getByTestId('delete').click();
  await page.getByTestId('confirm-yes').click();
  await expect(cards).toHaveCount(1);

  await page.reload();
  await expect(cards).toHaveCount(1);
});

test('settings: color, size and volume apply immediately and persist', async ({ page }) => {
  await fresh(page);
  await page.getByTestId('nav-settings').click();

  await page.getByTestId('swatch-FFD60A').click();
  await expect(page.locator('.preview-digits')).toHaveCSS('color', 'rgb(255, 214, 10)');

  // Red is rejected.
  await page.getByTestId('color-input').evaluate((el: HTMLInputElement) => {
    el.value = '#ff0000';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.getByTestId('color-error')).toContainText('Red is reserved');
  await expect(page.locator('.preview-digits')).toHaveCSS('color', 'rgb(255, 214, 10)');

  await page.getByTestId('digitSize-plus').click();
  await expect(page.getByTestId('digitSize-input')).toHaveValue('45');
  await expect(page.getByTestId('size-slider')).toHaveValue('45');
  await page.getByTestId('volume-input').fill('30');
  await page.getByTestId('volume-input').press('Enter');
  await expect(page.getByTestId('volume-slider')).toHaveValue('30');

  await page.reload();
  await page.getByTestId('nav-settings').click();
  await expect(page.getByTestId('digitSize-input')).toHaveValue('45');
  await expect(page.getByTestId('volume-input')).toHaveValue('30');

  // The run screen uses the color and size.
  await page.getByTestId('nav-routines').click();
  await page.getByTestId('start').click();
  await expect(page.getByTestId('run-phase')).toHaveText('WORK', { timeout: 7000 });
  await expect(page.getByTestId('run-digits')).toHaveCSS('color', 'rgb(255, 214, 10)');
  const fontPx = await page.getByTestId('run-digits').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(fontPx).toBeGreaterThan(200); // 45 % of an 800 px window is 360 px, capped to fit
});
