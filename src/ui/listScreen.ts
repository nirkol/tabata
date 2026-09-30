import { routineStats, type Routine } from '../routines/model';
import { totalDurationSec } from '../timer/engine';
import { formatClock } from '../timer/format';
import type { App, Screen } from './app';
import { confirmDialog } from './dialog';
import { h, isTyping } from './dom';

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
        h('button', { class: 'btn btn-ghost', 'data-testid': 'edit', onclick: stop(() => app.go({ name: 'editor', routineId: r.id })) }, 'Edit'),
        h('button', { class: 'btn btn-ghost btn-ghost-danger', 'data-testid': 'delete', onclick: stop(() => void remove(r)) }, 'Delete'),
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

  function moveBy(id: string, delta: number): void {
    const ids = app.routines.map((r) => r.id);
    const from = ids.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return;
    ids.splice(to, 0, ...ids.splice(from, 1));
    saveOrder(ids);
    list.querySelector<HTMLElement>(`.card[data-id="${CSS.escape(id)}"] .drag-handle`)?.focus();
  }

  function startDrag(e: PointerEvent, handle: HTMLElement): void {
    if (e.button !== 0) return;
    const dragged = handle.closest<HTMLElement>('.card');
    if (!dragged) return;
    e.preventDefault();
    e.stopPropagation();
    // Listen on the window, not the handle: moving the card in the DOM would drop pointer capture.
    dragged.classList.add('dragging');
    document.body.classList.add('reordering');
    let lastY = e.clientY;
    let frame = 0;

    // Moves the dragged card before the first card whose middle is below the pointer.
    const reposition = () => {
      const others = [...list.querySelectorAll<HTMLElement>('.card')].filter((c) => c !== dragged);
      const before = others.find((c) => {
        const rect = c.getBoundingClientRect();
        return lastY < rect.top + rect.height / 2;
      });
      if (before) {
        if (dragged.nextElementSibling !== before) list.insertBefore(dragged, before);
      } else if (list.lastElementChild !== dragged) {
        list.append(dragged);
      }
    };
    // Scrolls the list while the pointer is near its top or bottom edge.
    const tick = () => {
      const box = list.getBoundingClientRect();
      const edge = 48;
      if (lastY < box.top + edge) list.scrollTop -= Math.ceil((box.top + edge - lastY) / 4);
      else if (lastY > box.bottom - edge) list.scrollTop += Math.ceil((lastY - (box.bottom - edge)) / 4);
      reposition();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId === e.pointerId) lastY = ev.clientY;
    };
    const onEnd = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      dragged.classList.remove('dragging');
      document.body.classList.remove('reordering');
      // The drop can fire a click on a card; don't let it select that card.
      const swallow = (ce: Event) => ce.stopPropagation();
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
      saveOrder([...list.querySelectorAll<HTMLElement>('.card')].map((c) => c.dataset.id!));
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
