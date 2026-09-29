import { createRoutine, routineSummary, type Routine } from '../routines/model';
import { totalDurationSec } from '../timer/engine';
import { formatClock } from '../timer/format';
import type { App, Screen } from './app';
import { confirmDialog } from './dialog';
import { h, isTyping } from './dom';

/** The routine list (SPEC §5.1). */
export function listScreen(app: App): Screen {
  const list = h('div', { class: 'cards', 'data-testid': 'routine-list' });
  const el = h(
    'section',
    { class: 'list-screen' },
    h(
      'div',
      { class: 'screen-header' },
      h('h1', {}, 'Routines'),
      h('button', { class: 'btn btn-primary', 'data-testid': 'new-routine', onclick: () => app.go({ name: 'editor', routineId: null }) }, '+ New Routine'),
    ),
    list,
    h('p', { class: 'hint' }, 'Tip: press Enter to start the highlighted routine.'),
  );

  const selectedId = () => app.lastUsedId ?? app.routines[0]?.id ?? null;

  function render(): void {
    list.replaceChildren();
    if (app.routines.length === 0) {
      list.append(h('p', { class: 'empty' }, 'No routines yet. Create one with “+ New Routine”.'));
      return;
    }
    for (const r of app.routines) list.append(card(r));
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
      h('div', { class: 'card-main' }, h('h2', { class: 'card-title', 'data-testid': 'routine-name' }, r.name), h('div', { class: 'card-summary' }, routineSummary(r)), h('div', { class: 'card-total' }, `Total ${formatClock(totalDurationSec(r))}`)),
      h(
        'div',
        { class: 'card-actions' },
        h('button', { class: 'btn btn-primary', 'data-testid': 'start', onclick: stop(() => app.startRoutine(r.id)) }, '▶ Start'),
        h('button', { class: 'btn', 'data-testid': 'edit', onclick: stop(() => app.go({ name: 'editor', routineId: r.id })) }, 'Edit'),
        h('button', { class: 'btn', 'data-testid': 'duplicate', onclick: stop(() => duplicate(r)) }, 'Duplicate'),
        h('button', { class: 'btn btn-danger-outline', 'data-testid': 'delete', onclick: stop(() => void remove(r)) }, 'Delete'),
      ),
    );
    return c;
  }

  function duplicate(r: Routine): void {
    const suffix = ' copy';
    const copy = createRoutine({ ...r, name: r.name.slice(0, 40 - suffix.length) + suffix });
    const idx = app.routines.findIndex((x) => x.id === r.id);
    const next = [...app.routines];
    next.splice(idx + 1, 0, copy);
    app.saveRoutines(next);
    render();
  }

  async function remove(r: Routine): Promise<void> {
    if (!(await confirmDialog(`Delete “${r.name}”? This can't be undone.`, 'Delete'))) return;
    app.saveRoutines(app.routines.filter((x) => x.id !== r.id));
    render();
  }

  render();
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
