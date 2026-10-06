import { timerTitle, type PresetTimer } from '../timers/model';
import { formatClock } from '../timer/format';
import type { App, Screen } from './app';
import { confirmDialog } from './dialog';
import { h } from './dom';
import { ICON_PENCIL, ICON_TRASH, iconButton } from './listScreen';

/** The preset timers list (SPEC §5b), sorted from short to long. */
export function timersScreen(app: App): Screen {
  const list = h('div', { class: 'cards timer-grid', 'data-testid': 'timer-list' });
  const count = h('p', { class: 'list-count', 'data-testid': 'timer-count' });
  const el = h(
    'section',
    { class: 'list-screen' },
    h(
      'div',
      { class: 'screen-header list-header' },
      h('div', {}, h('h1', { class: 'list-title' }, 'Timers'), count),
      h('button', { class: 'btn btn-primary btn-pill', 'data-testid': 'new-timer', onclick: () => app.go({ name: 'timerEditor', timerId: null }) }, '+ New Timer'),
    ),
    list,
    h('p', { class: 'hint list-hint' }, 'Timers are sorted from shortest to longest'),
  );

  function render(): void {
    list.replaceChildren();
    const n = app.timers.length;
    count.textContent = n === 1 ? '1 timer' : `${n} timers`;
    if (n === 0) {
      list.append(h('p', { class: 'empty' }, 'No timers yet. Create one with “+ New Timer”.'));
      return;
    }
    for (const t of app.timers) list.append(card(t));
  }

  /** A square tile: title at the top, the duration large in the middle, the buttons at the bottom. */
  function card(t: PresetTimer): HTMLElement {
    return h(
      'article',
      { class: 'card timer-card', 'data-testid': 'timer-card', 'data-id': t.id },
      h(
        'div',
        { class: 'timer-card-body' },
        h('h2', { class: 'card-title timer-card-title', dir: 'auto', 'data-testid': 'timer-name' }, timerTitle(t)),
        h(
          'dl',
          { class: 'timer-card-duration', 'data-testid': 'timer-stats' },
          h('dt', {}, 'Duration'),
          h('dd', { 'data-testid': 'timer-duration' }, formatClock(t.durationSec)),
        ),
        h(
          'div',
          { class: 'card-actions timer-card-actions' },
          h('button', { class: 'btn btn-primary btn-pill btn-start', 'data-testid': 'start', 'aria-label': 'Start', onclick: () => app.startTimer(t.id) }, '▶', h('span', { class: 'btn-start-label' }, ' Start')),
          iconButton('edit', 'Edit', ICON_PENCIL, 'btn-ghost', () => app.go({ name: 'timerEditor', timerId: t.id })),
          iconButton('delete', 'Delete', ICON_TRASH, 'btn-ghost btn-ghost-danger', () => void remove(t)),
        ),
      ),
    );
  }

  async function remove(t: PresetTimer): Promise<void> {
    if (!(await confirmDialog(`Delete the “⁨${timerTitle(t)}⁩” timer? This can't be undone.`, 'Delete'))) return;
    app.saveTimers(app.timers.filter((x) => x.id !== t.id));
    render();
  }

  render();
  return { el };
}
