import type { ClassContext } from './app';
import { h } from './dom';

/**
 * Class mode on the Run and Timer screens (SPEC §5d): the class name and position at the top,
 * and when an item finishes, "Up next: … in 5" with a countdown that starts the next item.
 */
export function classAdvance(ctx: ClassContext, delaySec: number, speed: number) {
  const banner = h(
    'div',
    { class: 'run-class', 'data-testid': 'run-class' },
    h('span', { class: 'run-class-tag' }, 'Class'),
    h('bdi', { class: 'run-class-name' }, ctx.name),
    h('span', { class: 'run-class-pos', 'data-testid': 'run-class-pos' }, ctx.position),
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
    banner,
    line,
    nextBtn,
    /** The item finished: mark it played and count down to the next one. */
    finished(): void {
      ctx.finished();
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
