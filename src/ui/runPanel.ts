import type { Routine } from '../routines/model';
import { PHASE_LABELS, type Snapshot } from '../timer/engine';
import { formatClock, formatCountdown } from '../timer/format';
import { h } from './dom';

/** A row of dots: filled for finished, ringed for the current one. */
function dots(n: number, cls: string): { el: HTMLElement; set(done: number, current: number): void } {
  const items = Array.from({ length: n }, () => h('span', { class: 'run-dot' }));
  const el = h('div', { class: `run-dots ${cls}`, 'aria-hidden': 'true' }, ...items);
  return {
    el,
    set(done, current) {
      items.forEach((d, i) => {
        d.classList.toggle('done', i < done);
        d.classList.toggle('current', i + 1 === current);
      });
    },
  };
}

/**
 * The info panel on the right of the Run screen (SPEC §4.1): Next, Rounds left, Cycle,
 * each round's Work / Rest (the current one highlighted) and the remaining times.
 */
export function runPanel(routine: Routine, showRemaining: boolean): { el: HTMLElement; update(s: Snapshot): void } {
  const r = routine;
  const card = (label: string, testId: string, ...children: (HTMLElement | null)[]) =>
    h('div', { class: 'run-card', 'data-testid': testId }, h('div', { class: 'run-card-label' }, label), ...children);

  const nextValue = h('div', { class: 'run-card-big', 'data-testid': 'run-next' });
  const roundsValue = h('div', { class: 'run-card-big', 'data-testid': 'run-intervals' });
  const roundDots = dots(r.intervals, 'run-dots-rounds');
  const cycleValue = h('div', { class: 'run-card-big', 'data-testid': 'run-set-info' });
  const cycleDots = dots(r.sets, 'run-dots-cycles');
  const workPart = h('div', { class: 'run-split-part run-split-work' }, h('span', {}, 'Work'), h('b', {}, formatClock(r.workSec)));
  const restPart = h('div', { class: 'run-split-part run-split-rest' }, h('span', {}, 'Rest'), h('b', {}, formatClock(r.restSec)));
  const cycleRem = h('b', { 'data-testid': 'run-set-remaining' });
  const totalRem = h('b', { 'data-testid': 'run-total' });
  const remainingCard = card('Remaining', 'run-remaining', h('div', { class: 'run-rem' }, h('div', {}, h('span', {}, 'Cycle'), cycleRem), h('div', {}, h('span', {}, 'Total'), totalRem)));
  remainingCard.hidden = !showRemaining;

  const el = h(
    'aside',
    { class: 'run-panel', 'data-testid': 'run-info' },
    card('Next', 'run-next-card', nextValue),
    card('Rounds left', 'run-rounds-card', roundsValue, roundDots.el),
    card('Cycle', 'run-cycle-card', cycleValue, cycleDots.el),
    card('Each round', 'run-round-card', h('div', { class: 'run-split' }, workPart, restPart)),
    remainingCard,
  );

  return {
    el,
    update(s) {
      const done = s.status === 'done';
      nextValue.textContent = done ? '—' : s.nextPhase ? `${PHASE_LABELS[s.nextPhase.kind]} ${formatClock(s.nextPhase.durationSec)}` : PHASE_LABELS.done;
      // Rounds: finished ones filled, the one being worked ringed.
      const left = done ? 0 : s.intervalsLeft;
      roundsValue.textContent = `${left} of ${r.intervals}`;
      roundDots.set(r.intervals - left, !done && s.phase?.kind === 'work' ? r.intervals - left + 1 : -1);
      const cycle = s.phase ? s.phase.set : r.sets;
      cycleValue.textContent = `${cycle} of ${r.sets}`;
      cycleDots.set(done ? r.sets : cycle - 1, done ? -1 : cycle);
      const kind = done ? null : s.phase?.kind;
      workPart.classList.toggle('active', kind === 'work');
      restPart.classList.toggle('active', kind === 'rest');
      cycleRem.textContent = formatCountdown(done ? 0 : s.setRemainingMs);
      totalRem.textContent = formatCountdown(done ? 0 : s.totalRemainingMs);
    },
  };
}
