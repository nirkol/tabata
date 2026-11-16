import type { ClassContext } from './app';
import { h } from './dom';
import { formatClock } from '../timer/format';

/**
 * Class mode on the Run and Timer screens (SPEC §5d): a band across the top (10% of the screen)
 * with every item of the class — done ✓, the one playing (with how far into it) and the ones to
 * come — then a divider; and when an item finishes, "Up next: … in 5" with a countdown that
 * starts the next item.
 */
export function classAdvance(ctx: ClassContext, delaySec: number, speed: number) {
  const fill = h('div', { class: 'class-band-fill' });
  const chips = ctx.items.map((item, i) => {
    const state = i < ctx.index ? 'done' : i === ctx.index ? 'now' : 'todo';
    return h(
      'li',
      { class: `class-band-item state-${state}`, 'data-testid': 'class-band-item', 'data-state': state, title: item.label },
      h('span', { class: 'class-band-marker' }, state === 'done' ? '✓' : String(i + 1)),
      h(
        'span',
        { class: 'class-band-text' },
        h('span', { class: 'class-band-name', dir: 'auto' }, item.kind === 'timer' ? `Timer ${item.label}` : item.label),
        h('span', { class: 'class-band-time' }, formatClock(item.durationSec)),
      ),
      state === 'now' ? fill : null,
    );
  });
  const band = h(
    'div',
    { class: 'class-band', 'data-testid': 'run-class' },
    h(
      'div',
      { class: 'class-band-head' },
      h('span', { class: 'class-band-tag' }, 'Class'),
      h('bdi', { class: 'class-band-title' }, ctx.name),
      h('span', { class: 'class-band-pos', 'data-testid': 'run-class-pos' }, ctx.position),
    ),
    h('ol', { class: 'class-band-items' }, ...chips),
  );
  const line = h('div', { class: 'run-class-next', hidden: true, 'data-testid': 'class-next-line' });
  const nextBtn = h(
    'button',
    { type: 'button', class: 'btn btn-run btn-primary', hidden: true, 'data-testid': 'class-next', onclick: () => go() },
    '▶ Next now',
  );
  let timer: ReturnType<typeof setInterval> | undefined;
  let left = 0;

  function go(): void {
    cancel();
    ctx.advance();
  }
  function cancel(): void {
    clearInterval(timer);
    timer = undefined;
  }
  function paint(): void {
    line.replaceChildren('Up next: ', h('bdi', {}, ctx.next ?? ''), ` · starts in ${left}`);
  }

  return {
    band,
    /** How far into the current item (0–1), shown as a fill in its chip. */
    setProgress(fraction: number): void {
      fill.style.width = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
    },
    line,
    nextBtn,
    /** The item finished: mark it played and count down to the next one. */
    finished(): void {
      ctx.finished();
      // The current item becomes done in the band.
      const chip = chips[ctx.index];
      if (chip) {
        chip.className = 'class-band-item state-done';
        chip.dataset.state = 'done';
        chip.querySelector('.class-band-marker')!.textContent = '✓';
        fill.remove();
      }
      line.hidden = false;
      if (!ctx.next) {
        line.textContent = 'Class complete!';
        line.classList.add('run-class-done');
        return;
      }
      nextBtn.hidden = false;
      left = delaySec;
      paint();
      // (Divided by the dev speed flag, like every other duration; 1× in the app.)
      timer = setInterval(() => {
        left -= 1;
        if (left <= 0) go();
        else paint();
      }, 1000 / speed);
    },
    cancel,
  };
}
