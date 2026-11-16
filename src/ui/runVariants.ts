/**
 * TEMPORARY: three alternative layouts of the Run screen, opened from the 1 / 2 / 3 buttons in
 * the top bar, so the user can compare them. The chosen one replaces the current layout and
 * this file is removed. They show the same information, in the same colors.
 */
import type { Routine } from '../routines/model';
import { PHASE_LABELS, type Phase, type Snapshot } from '../timer/engine';
import { formatClock, formatCountdown } from '../timer/format';
import { h } from './dom';

export type RunVariant = 1 | 2 | 3;

export const RUN_VARIANT_NAMES: Record<RunVariant, string> = {
  1: 'Clear stack',
  2: 'Side panel',
  3: 'Big screen',
};

/** The parts of the Run screen a variant arranges (built by runScreen as usual). */
export interface RunParts {
  routine: Routine;
  phases: readonly Phase[];
  showRemaining: boolean;
  /** Routine name (and class banner), speed badge. */
  topLeft: HTMLElement;
  speedBadge: HTMLElement | null;
  fullscreenBtn: HTMLElement;
  timeline: HTMLElement;
  phaseLabel: HTMLElement;
  ringBox: HTMLElement;
  /** The original "Next: …" element (not used by the variants). */
  next: HTMLElement;
  controls: HTMLElement;
  volumeGroup: HTMLElement;
  /** Extra lines under the counter (class "Up next"). */
  extras: (HTMLElement | null | undefined)[];
}

export interface VariantUi {
  el: HTMLElement;
  stage: HTMLElement;
  update(s: Snapshot): void;
}

const nextText = (s: Snapshot) => (s.status === 'done' ? '—' : s.nextPhase ? `${PHASE_LABELS[s.nextPhase.kind]} ${formatClock(s.nextPhase.durationSec)}` : PHASE_LABELS.done);

/** Rounds of the current cycle that are finished, and whether one is in progress. */
function roundProgress(s: Snapshot, intervals: number): { done: number; current: number } {
  if (s.status === 'done') return { done: intervals, current: -1 };
  const done = intervals - s.intervalsLeft;
  return { done, current: s.phase?.kind === 'work' ? done + 1 : -1 };
}

/** Length of each cycle (its Work and Rest periods and the Rest between cycles), in ms. */
function cycleLengths(phases: readonly Phase[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const p of phases) if (p.kind !== 'getReady') m.set(p.set, (m.get(p.set) ?? 0) + p.durationSec * 1000);
  return m;
}

/** A row of dots: filled for finished, ringed for the current one. */
function dots(n: number, cls: string): { el: HTMLElement; set(done: number, current: number): void } {
  const items = Array.from({ length: n }, () => h('span', { class: 'rv-dot' }));
  const el = h('div', { class: `rv-dots ${cls}`, 'aria-hidden': 'true' }, ...items);
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

/** A labeled progress bar with the time on the right. */
function bar(label: string, testId: string): { el: HTMLElement; set(remainingMs: number, totalMs: number): void } {
  const fill = h('div', { class: 'rv-bar-fill' });
  const value = h('span', { class: 'rv-bar-value', 'data-testid': testId });
  const el = h('div', { class: 'rv-bar' }, h('div', { class: 'rv-bar-head' }, h('span', { class: 'rv-bar-label' }, label), value), h('div', { class: 'rv-bar-track' }, fill));
  return {
    el,
    set(remainingMs, totalMs) {
      value.textContent = formatCountdown(remainingMs);
      fill.style.width = `${totalMs > 0 ? Math.max(0, Math.min(100, (remainingMs / totalMs) * 100)) : 0}%`;
    },
  };
}

export function buildRunVariant(variant: RunVariant, p: RunParts): VariantUi {
  p.next.remove();
  const r = p.routine;
  const cycles = cycleLengths(p.phases);
  const totalMs = p.phases.length ? p.phases[p.phases.length - 1].endMs : 0;
  const badge = h('span', { class: 'rv-badge', title: 'Temporary design preview' }, `Design ${variant} · ${RUN_VARIANT_NAMES[variant]}`);
  const top = h('div', { class: 'run-top' }, p.topLeft, h('div', { class: 'run-top-right' }, badge, p.speedBadge, p.fullscreenBtn));
  const bottom = (left: HTMLElement | null) =>
    h('div', { class: 'run-bottom' }, h('div', { class: 'run-bottom-side' }, left), p.controls, h('div', { class: 'run-bottom-side run-bottom-right' }, p.volumeGroup));

  // Shared helpers for the current cycle.
  const cycleOf = (s: Snapshot) => (s.phase ? s.phase.set : r.sets);
  const cycleRemaining = (s: Snapshot) => {
    const len = cycles.get(cycleOf(s)) ?? 0;
    return { remaining: s.status === 'done' ? 0 : s.setRemainingMs, len };
  };

  if (variant === 1) {
    // --- 1. Clear stack: one column, every value labeled, the current period highlighted. ---
    const nextValue = h('span', { class: 'rv-next-value', 'data-testid': 'run-next' });
    const nextPill = h('div', { class: 'rv-next-pill' }, h('span', { class: 'rv-next-label' }, 'Next'), nextValue);
    const tile = (label: string, extra = '') => {
      const value = h('div', { class: 'rv-tile-value' });
      const el = h('div', { class: `rv-tile ${extra}` }, h('div', { class: 'rv-tile-label' }, label), value);
      return { el, value };
    };
    const cycle = tile('Cycle');
    const rounds = tile('Rounds left');
    const work = tile('Work', 'rv-tile-work');
    const rest = tile('Rest', 'rv-tile-rest');
    work.value.textContent = formatClock(r.workSec);
    rest.value.textContent = formatClock(r.restSec);
    const cycleBar = bar('Cycle remaining', 'run-set-remaining');
    const totalBar = bar('Total remaining', 'run-total');
    const bars = h('div', { class: 'rv-bars', hidden: !p.showRemaining }, cycleBar.el, totalBar.el);
    const stage = h('div', { class: 'run-stage' }, p.phaseLabel, p.ringBox, nextPill, ...p.extras);
    const info = h('div', { class: 'rv-info' }, h('div', { class: 'rv-tiles' }, cycle.el, rounds.el, work.el, rest.el), bars);
    const el = h('section', { class: 'run-screen run-v1', 'data-testid': 'run-screen' }, top, p.timeline, stage, info, bottom(null));
    return {
      el,
      stage,
      update(s) {
        nextValue.textContent = nextText(s);
        nextPill.hidden = s.status === 'done';
        cycle.value.textContent = `${cycleOf(s)} / ${r.sets}`;
        rounds.value.textContent = `${s.status === 'done' ? 0 : s.intervalsLeft} / ${r.intervals}`;
        const kind = s.status === 'done' ? null : s.phase?.kind;
        work.el.classList.toggle('active', kind === 'work');
        rest.el.classList.toggle('active', kind === 'rest');
        const c = cycleRemaining(s);
        cycleBar.set(c.remaining, c.len);
        totalBar.set(s.status === 'done' ? 0 : s.totalRemainingMs, totalMs);
      },
    };
  }

  if (variant === 2) {
    // --- 2. Side panel: the counter on the left, everything else in a panel of cards on the right. ---
    const card = (label: string, ...children: (HTMLElement | null)[]) => h('div', { class: 'rv-card' }, h('div', { class: 'rv-card-label' }, label), ...children);
    const nextValue = h('div', { class: 'rv-card-big', 'data-testid': 'run-next' });
    const roundsValue = h('div', { class: 'rv-card-big' });
    const roundDots = dots(r.intervals, 'rv-dots-rounds');
    const cycleValue = h('div', { class: 'rv-card-big' });
    const cycleDots = dots(r.sets, 'rv-dots-cycles');
    const workPart = h('div', { class: 'rv-split-part rv-split-work' }, h('span', {}, 'Work'), h('b', {}, formatClock(r.workSec)));
    const restPart = h('div', { class: 'rv-split-part rv-split-rest' }, h('span', {}, 'Rest'), h('b', {}, formatClock(r.restSec)));
    const cycleRem = h('b', { 'data-testid': 'run-set-remaining' });
    const totalRem = h('b', { 'data-testid': 'run-total' });
    const panel = h(
      'aside',
      { class: 'rv-panel' },
      card('Next', nextValue),
      card('Rounds left', roundsValue, roundDots.el),
      card('Cycle', cycleValue, cycleDots.el),
      card('Each round', h('div', { class: 'rv-split' }, workPart, restPart)),
      p.showRemaining ? card('Remaining', h('div', { class: 'rv-rem' }, h('div', {}, h('span', {}, 'Cycle'), cycleRem), h('div', {}, h('span', {}, 'Total'), totalRem))) : null,
    );
    const stage = h('div', { class: 'run-stage' }, p.phaseLabel, p.ringBox, ...p.extras);
    const el = h('section', { class: 'run-screen run-v2', 'data-testid': 'run-screen' }, top, p.timeline, h('div', { class: 'rv-main' }, stage, panel), bottom(null));
    return {
      el,
      stage,
      update(s) {
        nextValue.textContent = nextText(s);
        const rp = roundProgress(s, r.intervals);
        roundsValue.textContent = `${s.status === 'done' ? 0 : s.intervalsLeft} of ${r.intervals}`;
        roundDots.set(rp.done, rp.current);
        const cyc = cycleOf(s);
        cycleValue.textContent = `${cyc} of ${r.sets}`;
        cycleDots.set(s.status === 'done' ? r.sets : cyc - 1, s.status === 'done' ? -1 : cyc);
        const kind = s.status === 'done' ? null : s.phase?.kind;
        workPart.classList.toggle('active', kind === 'work');
        restPart.classList.toggle('active', kind === 'rest');
        cycleRem.textContent = formatCountdown(cycleRemaining(s).remaining);
        totalRem.textContent = formatCountdown(s.status === 'done' ? 0 : s.totalRemainingMs);
      },
    };
  }

  // --- 3. Big screen: readable across the room. The whole screen takes the period's color,
  // the counter has a progress bar under it, and the rounds are a segmented strip. ---
  const phaseFill = h('div', { class: 'rv-phasebar-fill' });
  const phaseBar = h('div', { class: 'rv-phasebar', 'aria-hidden': 'true' }, phaseFill);
  const nextValue = h('span', { class: 'rv-next-value', 'data-testid': 'run-next' });
  const nextLine = h('div', { class: 'rv-next-line' }, h('span', { class: 'rv-next-label' }, 'Next'), nextValue);
  const segs = Array.from({ length: r.intervals }, () => h('span', { class: 'rv-seg' }));
  const roundsText = h('span', { class: 'rv-strip-text' });
  const cycleText = h('span', { class: 'rv-strip-cycle' });
  const strip = h('div', { class: 'rv-strip' }, cycleText, h('div', { class: 'rv-segs', 'aria-hidden': 'true' }, ...segs), roundsText);
  const cycleRem = h('b', { 'data-testid': 'run-set-remaining' });
  const totalRem = h('b', { 'data-testid': 'run-total' });
  const remaining = h('div', { class: 'rv-corner-rem', hidden: !p.showRemaining }, h('div', {}, h('span', {}, 'Cycle left'), cycleRem), h('div', {}, h('span', {}, 'Total left'), totalRem));
  const plan = h(
    'div',
    { class: 'rv-plan' },
    h('span', { class: 'rv-plan-work' }, 'Work ', h('b', {}, formatClock(r.workSec))),
    h('span', { class: 'rv-plan-rest' }, 'Rest ', h('b', {}, formatClock(r.restSec))),
  );
  const top3 = h('div', { class: 'run-top' }, p.topLeft, remaining, h('div', { class: 'run-top-right' }, badge, p.speedBadge, p.fullscreenBtn));
  const stage = h('div', { class: 'run-stage' }, p.phaseLabel, p.ringBox, phaseBar, nextLine, ...p.extras);
  const el = h('section', { class: 'run-screen run-v3', 'data-testid': 'run-screen' }, top3, p.timeline, stage, strip, bottom(plan));
  return {
    el,
    stage,
    update(s) {
      const done = s.status === 'done';
      phaseFill.style.width = `${done ? 0 : s.phaseFractionRemaining * 100}%`;
      nextValue.textContent = nextText(s);
      nextLine.hidden = done;
      const rp = roundProgress(s, r.intervals);
      segs.forEach((g, i) => {
        g.classList.toggle('done', i < rp.done);
        g.classList.toggle('current', i + 1 === rp.current);
      });
      roundsText.textContent = `${done ? 0 : s.intervalsLeft} / ${r.intervals} rounds left`;
      cycleText.textContent = `Cycle ${cycleOf(s)} / ${r.sets}`;
      cycleRem.textContent = formatCountdown(cycleRemaining(s).remaining);
      totalRem.textContent = formatCountdown(done ? 0 : s.totalRemainingMs);
    },
  };
}
