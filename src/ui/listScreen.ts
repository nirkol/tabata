import { routineStats, type Routine } from '../routines/model';
import { totalDurationSec } from '../timer/engine';
import { formatClock } from '../timer/format';
import type { App, Screen } from './app';
import { confirmDialog } from './dialog';
import { h, isTyping } from './dom';

const ICON_PENCIL =
  '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9a2.83 2.83 0 0 0-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>';
const ICON_TRASH =
  '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>';

/** An icon-only button with a tooltip and an accessible name. */
function iconButton(testId: string, label: string, svg: string, classes: string, onclick: (e: Event) => void): HTMLButtonElement {
  const b = h('button', { type: 'button', class: `btn btn-icon-only ${classes}`, title: label, 'aria-label': label, 'data-testid': testId, onclick });
  b.innerHTML = svg;
  return b;
}

/** The routine list (SPEC §5.1). */
export function listScreen(app: App): Screen {
  const list = h('div', { class: 'cards', 'data-testid': 'routine-list' });
  const count = h('p', { class: 'list-count', 'data-testid': 'routine-count' });
  const el = h(
    'section',
    { class: 'list-screen' },
    h(
      'div',
      { class: 'screen-header list-header' },
      h('div', {}, h('h1', { class: 'list-title' }, 'Routines'), count),
      h('button', { class: 'btn btn-primary btn-pill', 'data-testid': 'new-routine', onclick: () => app.go({ name: 'editor', routineId: null }) }, '+ New Routine'),
    ),
    list,
    h('p', { class: 'hint list-hint' }, 'Press ', h('kbd', {}, 'Enter'), ' to start the highlighted routine'),
  );

  const selectedId = () => app.lastUsedId ?? app.routines[0]?.id ?? null;

  function render(): void {
    const scrollTop = list.scrollTop; // keep the scroll position when re-rendering
    list.replaceChildren();
    const n = app.routines.length;
    count.textContent = n === 1 ? '1 routine' : `${n} routines`;
    if (app.routines.length === 0) {
      list.append(h('p', { class: 'empty' }, 'No routines yet. Create one with “+ New Routine”.'));
      return;
    }
    for (const r of app.routines) list.append(card(r));
    list.scrollTop = scrollTop;
  }

  function card(r: Routine): HTMLElement {
    const stop = (fn: () => void) => (e: Event) => {
      e.stopPropagation();
      fn();
    };
    const c = h(
      'article',
      {
        class: 'card' + (r.id === selectedId() ? ' selected' : ''),
        'data-testid': 'routine-card',
        'data-id': r.id,
        onclick: () => {
          app.setLastUsed(r.id);
          render();
        },
      },
      h(
        'div',
        { class: 'card-main' },
        h(
          'div',
          { class: 'card-title-row' },
          // dir="auto": Hebrew names read right-to-left, English names left-to-right.
          h('h2', { class: 'card-title', dir: 'auto', 'data-testid': 'routine-name' }, r.name),
          r.id === app.lastUsedId ? h('span', { class: 'badge', 'data-testid': 'last-used' }, 'Last used') : null,
        ),
        h(
          'dl',
          { class: 'card-stats', 'data-testid': 'routine-stats' },
          ...[...routineStats(r), { label: 'Total', value: formatClock(totalDurationSec(r)) }].map(({ label, value }) =>
            h('div', { class: 'stat' + (label === 'Total' ? ' stat-total' : '') }, h('dt', {}, label), h('dd', {}, value)),
          ),
        ),
      ),
      h(
        'div',
        { class: 'card-actions' },
        h('button', { class: 'btn btn-primary btn-pill btn-start', 'data-testid': 'start', onclick: stop(() => app.startRoutine(r.id)) }, '▶ Start'),
        iconButton('edit', 'Edit', ICON_PENCIL, 'btn-ghost', stop(() => app.go({ name: 'editor', routineId: r.id }))),
        iconButton('delete', 'Delete', ICON_TRASH, 'btn-ghost btn-ghost-danger', stop(() => void remove(r))),
        dragHandle(r),
      ),
    );
    return c;
  }

  // --- Reordering: drag the ☰ handle with the mouse, or focus it and press ↑ / ↓ ---

  function dragHandle(r: Routine): HTMLElement {
    const handle = h('button', {
      type: 'button',
      class: 'drag-handle',
      title: 'Drag to change the order (or press ↑ / ↓)',
      'aria-label': `Move “${r.name}” up or down`,
      'data-testid': 'drag-handle',
    });
    handle.innerHTML =
      '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
    handle.addEventListener('click', (e) => e.stopPropagation()); // don't select the card
    handle.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      e.stopPropagation();
      moveBy(r.id, e.key === 'ArrowUp' ? -1 : 1);
    });
    handle.addEventListener('pointerdown', (e) => startDrag(e, handle));
    return handle;
  }

  /** Saves the routines in the order of the given ids and redraws the list. */
  function saveOrder(ids: string[]): void {
    const byId = new Map(app.routines.map((r) => [r.id, r]));
    const next = ids.map((id) => byId.get(id)).filter((r): r is Routine => !!r);
    if (next.length !== app.routines.length || next.every((r, i) => r === app.routines[i])) return;
    app.saveRoutines(next);
    render();
  }

  const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  /** Positions of the cards by routine id (for animating reorders). */
  function cardRects(): Map<string, DOMRect> {
    const rects = new Map<string, DOMRect>();
    for (const c of list.querySelectorAll<HTMLElement>('.card')) rects.set(c.dataset.id!, c.getBoundingClientRect());
    return rects;
  }

  /** Slides cards from their old positions to their new ones ("FLIP" animation). */
  function animateFrom(before: Map<string, DOMRect>, skip?: HTMLElement): void {
    if (reduceMotion()) return;
    for (const c of list.querySelectorAll<HTMLElement>('.card')) {
      const old = before.get(c.dataset.id!);
      if (!old || c === skip || typeof c.animate !== 'function') continue;
      const dy = old.top - c.getBoundingClientRect().top;
      if (Math.abs(dy) > 0.5) {
        c.animate([{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }], { duration: 180, easing: 'ease-out' });
      }
    }
  }

  function moveBy(id: string, delta: number): void {
    const ids = app.routines.map((r) => r.id);
    const from = ids.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return;
    ids.splice(to, 0, ...ids.splice(from, 1));
    const before = cardRects();
    saveOrder(ids);
    animateFrom(before);
    list.querySelector<HTMLElement>(`.card[data-id="${CSS.escape(id)}"] .drag-handle`)?.focus();
  }

  /** How far the dragged card is pushed to the right, so it's clear which one is moving (~1 cm). */
  const DRAG_SHIFT_PX = 40;

  function startDrag(e: PointerEvent, handle: HTMLElement): void {
    if (e.button !== 0) return;
    const dragged = handle.closest<HTMLElement>('.card');
    if (!dragged) return;
    e.preventDefault();
    e.stopPropagation();

    // Lift the card out of the list: it follows the pointer, shifted to the right, and a
    // "Drop here" slot takes its place to show where it will land.
    const start = dragged.getBoundingClientRect();
    const grabOffset = e.clientY - start.top;
    const slot = h('div', { class: 'drop-slot', 'data-testid': 'drop-slot' }, h('span', {}, '↳ Drop here'));
    slot.style.height = `${start.height}px`;
    list.insertBefore(slot, dragged);
    Object.assign(dragged.style, { position: 'fixed', left: `${start.left}px`, top: `${start.top}px`, width: `${start.width}px`, margin: '0' });
    dragged.classList.add('dragging');
    document.body.classList.add('reordering');
    requestAnimationFrame(() => (dragged.style.transform = `translateX(${DRAG_SHIFT_PX}px) scale(1.02)`));

    let lastY = e.clientY;
    let frame = 0;
    let ended = false;

    // Moves the slot before the first card whose middle is below the pointer; the others slide.
    const reposition = () => {
      const others = [...list.querySelectorAll<HTMLElement>('.card')].filter((c) => c !== dragged);
      const before = others.find((c) => {
        const rect = c.getBoundingClientRect();
        return lastY < rect.top + rect.height / 2;
      });
      const target = before ?? null;
      // The card that currently follows the slot (the lifted card doesn't count).
      let next = slot.nextElementSibling;
      if (next === dragged) next = dragged.nextElementSibling;
      if (next === target) return;
      const rects = cardRects();
      if (target) list.insertBefore(slot, target);
      else list.append(slot);
      animateFrom(rects, dragged);
    };
    // Follows the pointer and scrolls the list near its top or bottom edge.
    const tick = () => {
      const box = list.getBoundingClientRect();
      const edge = 48;
      if (lastY < box.top + edge) list.scrollTop -= Math.ceil((box.top + edge - lastY) / 4);
      else if (lastY > box.bottom - edge) list.scrollTop += Math.ceil((lastY - (box.bottom - edge)) / 4);
      dragged.style.top = `${lastY - grabOffset}px`;
      reposition();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    // Listen on the window, not the handle: moving elements in the DOM would drop pointer capture.
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId === e.pointerId) lastY = ev.clientY;
    };
    const finish = () => {
      if (ended) return;
      ended = true;
      dragged.removeAttribute('style');
      dragged.classList.remove('dragging', 'landing');
      slot.replaceWith(dragged);
      saveOrder([...list.querySelectorAll<HTMLElement>('.card')].map((c) => c.dataset.id!));
    };
    const onEnd = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      document.body.classList.remove('reordering');
      // The drop can fire a click on a card; don't let it select that card.
      const swallow = (ce: Event) => ce.stopPropagation();
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
      // Glide into the slot, then put the card back into the list.
      if (reduceMotion()) return finish();
      const to = slot.getBoundingClientRect();
      dragged.classList.add('landing');
      dragged.style.top = `${to.top}px`;
      dragged.style.left = `${to.left}px`;
      dragged.style.transform = 'none';
      dragged.addEventListener('transitionend', finish, { once: true });
      setTimeout(finish, 260); // in case transitionend doesn't fire
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
  }

  async function remove(r: Routine): Promise<void> {
    if (!(await confirmDialog(`Delete “\u2068${r.name}\u2069”? This can't be undone.`, 'Delete'))) return;
    app.saveRoutines(app.routines.filter((x) => x.id !== r.id));
    render();
  }

  render();
  // Bring the highlighted routine into view once the list is on screen.
  requestAnimationFrame(() => list.querySelector('.card.selected')?.scrollIntoView({ block: 'nearest' }));
  return {
    el,
    onKey(e) {
      if (e.key !== 'Enter' || isTyping(e.target) || (e.target instanceof HTMLButtonElement)) return;
      const id = selectedId();
      if (id) {
        e.preventDefault();
        app.startRoutine(id);
      }
    },
  };
}
