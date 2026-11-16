import { classDurationSec, type WorkoutClass } from '../classes/model';
import { formatClock } from '../timer/format';
import type { App, Screen } from './app';
import { confirmDialog } from './dialog';
import { h } from './dom';
import { ICON_PENCIL, ICON_TRASH, iconButton } from './listScreen';

/** The list of classes (SPEC §5d). */
export function classesScreen(app: App): Screen {
  const list = h('div', { class: 'cards', 'data-testid': 'class-list' });
  const count = h('p', { class: 'list-count', 'data-testid': 'class-count' });
  const el = h(
    'section',
    { class: 'list-screen' },
    h(
      'div',
      { class: 'screen-header list-header' },
      h('div', {}, h('h1', { class: 'list-title' }, 'Classes'), count),
      h('button', { class: 'btn btn-primary btn-pill', 'data-testid': 'new-class', onclick: () => app.newClass() }, '+ New Class'),
    ),
    list,
    h('p', { class: 'hint list-hint' }, 'Click a class to see its list; ▶ Start plays its routines and timers one after the other'),
  );

  function render(): void {
    list.replaceChildren();
    const n = app.classes.length;
    count.textContent = n === 1 ? '1 class' : `${n} classes`;
    if (n === 0) {
      list.append(h('p', { class: 'empty' }, 'No classes yet. Create one with “+ New Class”, then add routines and timers to it.'));
      return;
    }
    for (const c of app.classes) list.append(card(c));
  }

  function card(c: WorkoutClass): HTMLElement {
    const open = () => app.go({ name: 'class', classId: c.id });
    const run = app.classRun;
    const inProgress = run?.classId === c.id && run.done < c.items.length;
    const routines = c.items.filter((i) => i.kind === 'routine').length;
    const timers = c.items.length - routines;
    const stat = (label: string, value: string, extra = '') => h('div', { class: 'stat' + extra }, h('dt', {}, label), h('dd', {}, value));
    return h(
      'article',
      { class: 'card' + (inProgress ? ' selected' : ''), 'data-testid': 'class-card', 'data-id': c.id, onclick: open },
      h(
        'div',
        { class: 'card-main' },
        h(
          'div',
          { class: 'card-title-row' },
          h('h2', { class: 'card-title', dir: 'auto', 'data-testid': 'class-name' }, c.name),
          inProgress ? h('span', { class: 'badge', 'data-testid': 'class-in-progress' }, 'In progress') : null,
        ),
        h(
          'dl',
          { class: 'card-stats', 'data-testid': 'class-stats' },
          stat('Routines', String(routines)),
          stat('Timers', String(timers)),
          stat('Total', formatClock(classDurationSec(c, app.routines, app.timers)), ' stat-total'),
        ),
      ),
      h(
        'div',
        { class: 'card-actions' },
        h(
          'button',
          {
            class: 'btn btn-primary btn-pill btn-start',
            'data-testid': inProgress ? 'continue-class' : 'start-class',
            disabled: c.items.length === 0,
            onclick: (e: Event) => {
              e.stopPropagation();
              if (inProgress) app.continueClass();
              else app.startClass(c.id);
            },
          },
          inProgress ? '▶ Continue' : '▶ Start',
        ),
        editButton(c.id, inProgress),
        iconButton('delete', 'Delete', ICON_TRASH, 'btn-ghost btn-ghost-danger', (e) => {
          e.stopPropagation();
          void remove(c);
        }),
      ),
    );
  }

  /** Edit (disabled while the class is in progress: its list can't change then). */
  function editButton(id: string, inProgress: boolean): HTMLButtonElement {
    const b = iconButton('edit', inProgress ? 'End the class to edit it' : 'Edit', ICON_PENCIL, 'btn-ghost', (e) => {
      e.stopPropagation();
      app.go({ name: 'classEditor', classId: id });
    });
    b.disabled = inProgress;
    return b;
  }

  async function remove(c: WorkoutClass): Promise<void> {
    if (!(await confirmDialog(`Delete the class “⁨${c.name}⁩”? Its routines and timers are kept.`, 'Delete'))) return;
    if (app.classRun?.classId === c.id) app.endClass();
    app.saveClasses(app.classes.filter((x) => x.id !== c.id));
    render();
  }

  render();
  return { el };
}
