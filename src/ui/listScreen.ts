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
      ),
    );
    return c;
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
