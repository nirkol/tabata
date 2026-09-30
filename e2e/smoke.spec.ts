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
  await expect(page.getByTestId('brand')).toHaveText('yFit Workout Timer');
  await expect(page).toHaveTitle('yFit Workout Timer');
  await expect(page.getByTestId('routine-card')).toHaveCount(1);
  await expect(page.getByTestId('routine-name')).toHaveText('Classic Tabata');
  await expect(page.getByTestId('routine-stats').locator('.stat')).toHaveText(['Work0:20', 'Rest0:10', 'Rounds8', 'Cycles1', 'Total3:55']);
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
  await expect(card.getByTestId('routine-stats').locator('.stat')).toHaveText(['Work0:15', 'Rest0:05', 'Rounds3', 'Cycles2', 'Rest between cycles0:20', 'Total2:15']);

  // Survives reload.
  await page.reload();
  await expect(page.getByTestId('routine-card').filter({ hasText: 'Smoke' })).toBeVisible();

  // Run.
  await page.getByTestId('routine-card').filter({ hasText: 'Smoke' }).getByTestId('start').click();
  await expect(page.getByTestId('run-screen')).toBeVisible();
  await expect(page.getByTestId('run-set-info')).toHaveText('Cycle 1 / 2');
  await expect(page.getByTestId('run-phase')).toHaveText('WORK', { timeout: 5000 });
  await expect(page.getByTestId('run-intervals')).toHaveText('Rounds left: 3 / 3');
  await expect(page.getByTestId('run-set-info')).toHaveText('Cycle 1 / 2');
  await expect(page.getByTestId('run-set-remaining')).toContainText('Cycle remaining: ');

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
  await expect(page.getByTestId('run-phase')).toHaveText('CYCLE REST', { timeout: 10000 });
  await expect(page.getByTestId('run-set-info')).toHaveText('Cycle 1 / 2');
  await expect(page.getByTestId('run-set-info')).toHaveText('Cycle 2 / 2', { timeout: 10000 });
  await expect(page.getByTestId('run-phase')).toHaveText('DONE', { timeout: 15000 });
  await expect(page.getByTestId('run-digits')).toHaveText('0:00');
  await expect(page).toHaveTitle('DONE – yFit Workout Timer');

  const beeps = await page.evaluate(() => (window as unknown as { __beeps: unknown[] }).__beeps.length);
  expect(beeps).toBeGreaterThan(0);

  // Start over runs the same routine again from Get Ready.
  await expect(page.getByTestId('start-over')).toBeVisible();
  await expect(page.getByTestId('pause')).toBeHidden();
  await page.getByTestId('start-over').click();
  await expect(page.getByTestId('run-phase')).toHaveText(/GET READY|WORK/);
  await expect(page.getByTestId('run-set-info')).toHaveText('Cycle 1 / 2');
  await expect(page.getByTestId('start-over')).toBeHidden();
  await expect(page.getByTestId('pause')).toBeVisible();
  await expect(page.getByTestId('run-phase')).toHaveText('DONE', { timeout: 15000 });

  await page.getByTestId('stop').click();
  await expect(page.getByTestId('routine-list')).toBeVisible();
});

test('run screen: no set counter at the top, volume control works', async ({ page }) => {
  await fresh(page);
  await page.getByTestId('start').click();
  await expect(page.locator('.run-top')).not.toContainText('Cycle 1');
  await expect(page.getByTestId('run-set-info')).toHaveText('Cycle 1 / 1');
  await expect(page.locator('.run-remaining')).toContainText('Cycle remaining');
  await expect(page.locator('.run-remaining')).toContainText('Total remaining');

  await expect(page.getByTestId('run-volume-value')).toHaveText('70%');
  await page.getByTestId('run-volume').fill('40');
  await expect(page.getByTestId('run-volume-value')).toHaveText('40%');
  // Mute, then turning the volume up unmutes.
  await page.getByTestId('run-mute').click();
  await expect(page.getByTestId('run-mute')).toHaveAttribute('aria-label', 'Unmute');
  await page.getByTestId('run-volume').fill('60');
  await expect(page.getByTestId('run-mute')).toHaveAttribute('aria-label', 'Mute');
  // Rest beeps have their own slider.
  await expect(page.getByTestId('run-volume-rest-value')).toHaveText('70%');
  await page.getByTestId('run-volume-rest').fill('25');
  await expect(page.getByTestId('run-volume-rest-value')).toHaveText('25%');
  await expect(page.getByTestId('run-volume-value')).toHaveText('60%');
  // The change is saved to Settings (pause first: a running routine can't be left).
  await page.getByTestId('pause').click();
  await page.keyboard.press('Escape');
  await page.getByTestId('confirm-yes').click();
  await page.getByTestId('nav-settings').click();
  await expect(page.getByTestId('volume-input')).toHaveValue('60');
  await expect(page.getByTestId('restVolume-input')).toHaveValue('25');
});

test('settings: beep styles and hiding the remaining times', async ({ page }) => {
  await fresh(page);
  await page.getByTestId('nav-settings').click();
  await expect(page.getByTestId('work-style')).toHaveValue('bell');
  await expect(page.getByTestId('rest-style')).toHaveValue('soft');
  await expect(page.getByTestId('work-style').locator('option')).toHaveText(['Classic beep', 'Soft beep', 'High beep', 'Low beep', 'Gym bell']);
  await page.getByTestId('work-style').selectOption('high');
  await page.getByTestId('rest-style').selectOption('low');
  await page.getByTestId('show-remaining').uncheck();

  await page.reload();
  await page.getByTestId('nav-settings').click();
  await expect(page.getByTestId('work-style')).toHaveValue('high');
  await expect(page.getByTestId('rest-style')).toHaveValue('low');
  await expect(page.getByTestId('show-remaining')).not.toBeChecked();

  await page.getByTestId('nav-routines').click();
  await page.getByTestId('start').click();
  await expect(page.getByTestId('run-set-info')).toBeVisible();
  await expect(page.getByTestId('run-remaining')).toBeHidden();
  await expect(page.getByTestId('run-next')).toBeVisible();

  // Turning it back on shows them again.
  await page.keyboard.press('Space');
  await page.keyboard.press('Escape');
  await page.getByTestId('confirm-yes').click();
  await page.getByTestId('nav-settings').click();
  await page.getByTestId('show-remaining').check();
  await page.getByTestId('nav-routines').click();
  await page.getByTestId('start').click();
  await expect(page.getByTestId('run-remaining')).toBeVisible();
});

test('timeline shows the whole plan and moves with the workout', async ({ page }) => {
  await fresh(page, '?speed=10');
  await page.getByTestId('start').click();
  // Classic Tabata: Get Ready + 8 work + 7 rest = 16 segments.
  const plan = page.getByTestId('timeline').locator('.tl-plan .tl-seg');
  await expect(plan).toHaveCount(16);
  await expect(page.locator('.tl-plan .tl-work')).toHaveCount(8);
  await expect(page.locator('.tl-plan .tl-rest')).toHaveCount(8);
  const markerLeft = () => page.getByTestId('timeline-marker').evaluate((el) => parseFloat((el as HTMLElement).style.left));
  const first = await markerLeft();
  await page.waitForTimeout(1500);
  expect(await markerLeft()).toBeGreaterThan(first);
});

test('voice cues: "Start!" when work begins, "Ten!" 10 s before it ends; each can be turned off', async ({ page }) => {
  // Record speech instead of playing it.
  await page.addInitScript(() => {
    const w = window as unknown as { __spoken: string[] };
    w.__spoken = [];
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: { speak: (u: SpeechSynthesisUtterance) => w.__spoken.push(u.text), cancel: () => undefined },
    });
  });
  await fresh(page, '?speed=5');
  await page.evaluate(() => {
    const now = new Date().toISOString();
    // G5 W20 R15 W20 → two work periods, one 15 s rest (no calls during rest).
    localStorage.setItem('tabata.v1.routines', JSON.stringify({ version: 1, routines: [{ id: 'x', name: 'Voice test', workSec: 20, restSec: 15, intervals: 2, sets: 1, setRestSec: 60, createdAt: now, updatedAt: now }] }));
  });
  await page.reload();
  const spoken = () => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken.slice());
  const clear = () => page.evaluate(() => ((window as unknown as { __spoken: string[] }).__spoken.length = 0));
  const runToEnd = async () => {
    await page.getByTestId('nav-routines').click();
    await page.getByTestId('start').click();
    await expect(page.getByTestId('run-phase')).toHaveText('DONE', { timeout: 20000 });
    await page.getByTestId('stop').click();
  };

  await page.getByTestId('nav-settings').click();
  await expect(page.getByTestId('start-call')).toBeChecked();
  await expect(page.getByTestId('ten-call')).toBeChecked();
  await runToEnd();
  expect(await spoken()).toEqual(['Start!', 'Ten!', 'Start!', 'Ten!']);

  // "Ten!" off: only "Start!".
  await clear();
  await page.getByTestId('nav-settings').click();
  await page.getByTestId('ten-call').uncheck();
  await runToEnd();
  expect(await spoken()).toEqual(['Start!', 'Start!']);

  // Both off: silence.
  await clear();
  await page.getByTestId('nav-settings').click();
  await page.getByTestId('start-call').uncheck();
  await runToEnd();
  expect(await spoken()).toEqual([]);
});

test('stop pauses the routine while asking for confirmation', async ({ page }) => {
  await fresh(page);
  await page.getByTestId('start').click();
  await expect(page.getByTestId('run-phase')).toHaveText('WORK', { timeout: 7000 });
  // Running: Stop is available; it pauses while the confirmation is shown.
  await expect(page.getByTestId('stop')).toBeEnabled();
  await page.getByTestId('stop').click();
  await expect(page.getByTestId('confirm-yes')).toBeVisible();
  await expect(page.getByTestId('run-screen')).toHaveClass(/paused/);
  const frozen = await page.getByTestId('run-digits').textContent();
  await page.waitForTimeout(1500);
  await expect(page.getByTestId('run-digits')).toHaveText(frozen!);
  // Cancel resumes.
  await page.getByTestId('confirm-no').click();
  await expect(page.getByTestId('run-screen')).not.toHaveClass(/paused/);
  await expect(page.getByTestId('pause')).toHaveText('PAUSE');
  // Esc works the same way; confirming goes back to the list.
  await page.keyboard.press('Escape');
  await page.getByTestId('confirm-yes').click();
  await expect(page.getByTestId('routine-list')).toBeVisible();
});

test('Hebrew routine names: right-to-left by default', async ({ page }) => {
  await fresh(page);
  await page.getByTestId('new-routine').click();
  await expect(page.getByTestId('name-input')).toHaveAttribute('dir', 'rtl');
  await page.getByTestId('name-input').fill('אימון בוקר');
  await page.getByTestId('save').click();
  const card = page.getByTestId('routine-card').filter({ hasText: 'אימון בוקר' });
  await expect(card.getByTestId('routine-name')).toHaveAttribute('dir', 'auto');
  expect(await card.getByTestId('routine-name').evaluate((el) => getComputedStyle(el).direction)).toBe('rtl');
  // English names still read left-to-right.
  const english = page.getByTestId('routine-card').filter({ hasText: 'Classic Tabata' }).getByTestId('routine-name');
  expect(await english.evaluate((el) => getComputedStyle(el).direction)).toBe('ltr');
});

test('editor can only be left with Save or Cancel', async ({ page }) => {
  await fresh(page);
  await page.getByTestId('new-routine').click();
  await expect(page.getByTestId('nav-routines')).toBeDisabled();
  await expect(page.getByTestId('nav-settings')).toBeDisabled();
  await page.getByTestId('nav-settings').click({ force: true });
  await expect(page.getByTestId('save')).toBeVisible();
  await page.getByTestId('cancel').click();
  await expect(page.getByTestId('routine-list')).toBeVisible();
  await expect(page.getByTestId('nav-settings')).toBeEnabled();
  await page.getByTestId('edit').click();
  await expect(page.getByTestId('nav-routines')).toBeDisabled();
  await page.getByTestId('save').click();
  await expect(page.getByTestId('nav-routines')).toBeEnabled();
});

test('colors: work is green (the chosen work color), rest is always red', async ({ page }) => {
  await fresh(page, '?speed=5');
  await page.getByTestId('start').click();
  const red = 'rgb(255, 59, 48)';
  const green = 'rgb(48, 209, 88)';
  // Get Ready counts as rest: red.
  await expect(page.getByTestId('run-phase')).toHaveText('GET READY');
  await expect(page.getByTestId('run-digits')).toHaveCSS('color', red);
  await expect(page.getByTestId('run-ring')).toHaveCSS('stroke', red);
  // Work: green for the whole phase, including its last 5 seconds.
  await expect(page.getByTestId('run-phase')).toHaveText('WORK', { timeout: 7000 });
  await expect(page.getByTestId('run-digits')).toHaveCSS('color', green);
  await expect(page.getByTestId('run-ring')).toHaveCSS('stroke', green);
  await expect(page.getByTestId('run-screen')).toHaveClass(/warning/, { timeout: 7000 });
  await expect(page.getByTestId('run-digits')).toHaveCSS('color', green);
  // Rest: red.
  await expect(page.getByTestId('run-phase')).toHaveText('REST', { timeout: 7000 });
  await expect(page.getByTestId('run-digits')).toHaveCSS('color', red);
});

test('editor: validation, press-and-hold and typed values', async ({ page }) => {
  await fresh(page);
  await page.getByTestId('new-routine').click();

  await page.getByTestId('restSec-input').fill('3:01');
  await expect(page.getByTestId('restSec-error')).toHaveText('Must be between 0:00 and 3:00');
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

test('routines can be reordered by dragging the handle or with the keyboard', async ({ page }) => {
  await fresh(page);
  await page.evaluate(() => {
    const now = new Date().toISOString();
    const routines = ['A', 'B', 'C', 'D'].map((n) => ({ id: n, name: `Routine ${n}`, workSec: 20, restSec: 10, intervals: 8, sets: 1, setRestSec: 60, createdAt: now, updatedAt: now }));
    localStorage.setItem('tabata.v1.routines', JSON.stringify({ version: 1, routines }));
    localStorage.setItem('tabata.v1.lastUsed', 'A');
  });
  await page.reload();
  const names = () => page.getByTestId('routine-name').allTextContents();
  expect(await names()).toEqual(['Routine A', 'Routine B', 'Routine C', 'Routine D']);

  // Drag D's handle to the top.
  const handle = page.locator('[data-id="D"]').getByTestId('drag-handle');
  const first = await page.locator('[data-id="A"]').boundingBox();
  await handle.hover();
  await page.mouse.down();
  await page.mouse.move(first!.x + 50, first!.y + 10, { steps: 12 });
  await expect(page.locator('[data-id="D"]')).toHaveClass(/dragging/);
  // A "Drop here" slot marks where it will land (at the top), and the card is shifted to the right.
  await expect(page.getByTestId('drop-slot')).toBeVisible();
  expect(await page.getByTestId('routine-list').locator('> *').first().getAttribute('data-testid')).toBe('drop-slot');
  const lifted = await page.locator('[data-id="D"]').boundingBox();
  expect(lifted!.x).toBeGreaterThan(first!.x + 25);
  await page.mouse.up();
  await expect(page.getByTestId('drop-slot')).toHaveCount(0);
  await expect.poll(names).toEqual(['Routine D', 'Routine A', 'Routine B', 'Routine C']);
  // Dropping doesn't select a card (A stays the highlighted one).
  await expect(page.locator('[data-id="D"]')).not.toHaveClass(/dragging/);
  await expect(page.locator('[data-id="A"]')).toHaveClass(/selected/);
  await expect(page.locator('[data-id="D"]')).not.toHaveClass(/selected/);

  // Keyboard: focus A's handle and press ↓ twice.
  await page.locator('[data-id="A"]').getByTestId('drag-handle').focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect.poll(names).toEqual(['Routine D', 'Routine B', 'Routine C', 'Routine A']);

  // The order is saved.
  await page.reload();
  expect(await names()).toEqual(['Routine D', 'Routine B', 'Routine C', 'Routine A']);
});

test('long routine list scrolls while the header stays visible', async ({ page }) => {
  await fresh(page);
  await page.evaluate(() => {
    const now = new Date().toISOString();
    const routines = Array.from({ length: 15 }, (_, i) => ({ id: `r${i}`, name: `Routine ${i + 1}`, workSec: 20, restSec: 10, intervals: 8, sets: 1, setRestSec: 60, createdAt: now, updatedAt: now }));
    localStorage.setItem('tabata.v1.routines', JSON.stringify({ version: 1, routines }));
    localStorage.setItem('tabata.v1.lastUsed', 'r14');
  });
  await page.reload();
  const list = page.getByTestId('routine-list');
  // The highlighted (last used) routine is scrolled into view.
  await expect(page.locator('[data-id="r14"]')).toBeInViewport();
  expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  await list.evaluate((el) => (el.scrollTop = 0));
  await expect(page.locator('[data-id="r0"]')).toBeInViewport();
  await expect(page.locator('[data-id="r14"]')).not.toBeInViewport();
  // Scrolling moves only the list: the header and New Routine button stay put.
  await page.locator('[data-id="r0"]').hover();
  await page.mouse.wheel(0, 5000);
  await expect(page.locator('[data-id="r14"]')).toBeInViewport();
  await expect(page.getByTestId('new-routine')).toBeInViewport();
  await expect(page.getByTestId('nav-settings')).toBeInViewport();
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
  // Rest beeps have their own volume.
  await page.getByTestId('restVolume-minus').click();
  await expect(page.getByTestId('restVolume-input')).toHaveValue('65');
  await expect(page.getByTestId('restVolume-slider')).toHaveValue('65');
  await expect(page.getByTestId('volume-input')).toHaveValue('30');
  await expect(page.getByTestId('restVolume-input')).toHaveValue('65');

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
