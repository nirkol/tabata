import { CLASS_NAME_MAX, classDurationSec, createClassItem, resolveItem, type ClassItem, type WorkoutClass } from '../classes/model';
import { routineStats } from '../routines/model';
import { formatClock } from '../timer/format';
import { timerTitle } from '../timers/model';
import type { App, Screen } from './app';
import { confirmDialog } from './dialog';
import { h, isTyping } from './dom';

type ItemState = 'done' | 'now' | 'next' | 'todo';

/** A class page (SPEC §5d): its name, the ordered list of routines and timers, and Start class. */
export function classScreen(app: App, classId: string): Screen {
  const cls = (): WorkoutClass | undefined => app.classes.find((c) => c.id === classId);

  const nameInput = h('input', {
    id: 'class-name-input',
    class: 'text-input name-input class-name-input',
    type: 'text',
    dir: 'auto',
    maxlength: CLASS_NAME_MAX,
    autocomplete: 'off',
    'aria-label': 'Class name',
    'data-testid': 'class-name-input',
  });
  const nameError = h('div', { class: 'field-error', 'data-testid': 'class-name-error' });
  const summary = h('p', { class: 'list-count', 'data-testid': 'class-summary' });
  const items = h('ol', { class: 'class-items', 'data-testid': 'class-items' });
  const lockNote = h('p', { class: 'class-lock-note', hidden: true, 'data-testid': 'class-lock-note' }, 'The class is in progress. End it to change the list.');
  const addPanel = h('div', { class: 'class-add', 'data-testid': 'class-add' });
  const status = h('div', { class: 'class-status', 'data-testid': 'class-status' });
  const actions = h('div', { class: 'class-actions' });

  const el = h(
    'section',
    { class: 'class-screen', 'data-testid': 'class-screen' },
    h('button', { type: 'button', class: 'btn btn-ghost class-back', 'data-testid': 'all-classes', onclick: () => app.go({ name: 'classes' }) }, '← All classes'),
    h('div', { class: 'class-head' }, h('div', { class: 'class-head-name' }, nameInput, nameError), summary),
    lockNote,
    items,
    addPanel,
    h('div', { class: 'class-footer' }, status, actions),
  );

  nameInput.value = cls()?.name ?? '';
  nameInput.addEventListener('input', () => {
    const name = nameInput.value.trim();
    nameError.textContent = name ? '' : 'Name is required';
    nameInput.classList.toggle('invalid', !name);
    if (name) update((c) => ({ ...c, name }), false);
  });

  /** Saves a change to this class. Editing a finished class clears its ✓ marks. */
  function update(change: (c: WorkoutClass) => WorkoutClass, redraw = true): void {
    const c = cls();
    if (!c) return;
    if (app.classRun?.classId === classId && redraw) app.endClass();
    const next = { ...change(c), updatedAt: new Date().toISOString() };
    app.saveClasses(app.classes.map((x) => (x.id === classId ? next : x)));
    if (redraw) render();
  }

  function move(index: number, delta: number): void {
    update((c) => {
      const list = [...c.items];
      const to = index + delta;
      if (to < 0 || to >= list.length) return c;
      list.splice(to, 0, ...list.splice(index, 1));
      return { ...c, items: list };
    });
    items.querySelectorAll<HTMLButtonElement>(`[data-testid="${delta < 0 ? 'item-up' : 'item-down'}"]`)[index + delta]?.focus();
  }

  function add(kind: ClassItem['kind'], refId: string): void {
    update((c) => ({ ...c, items: [...c.items, createClassItem(kind, refId)] }));
    items.lastElementChild?.scrollIntoView({ block: 'nearest' });
  }

  function render(): void {
    const c = cls();
    if (!c) return;
    const run = app.classRun?.classId === classId ? app.classRun : null;
    const total = c.items.length;
    const complete = !!run && total > 0 && run.done >= total;
    const inProgress = !!run && !complete;
    const playing = inProgress && app.hasClassSession();

    summary.textContent = `${total === 1 ? '1 item' : `${total} items`} · Total ${formatClock(classDurationSec(c, app.routines, app.timers))}`;
    el.classList.toggle('locked', inProgress);
    lockNote.hidden = !inProgress;
    nameInput.disabled = inProgress;

    // --- The list, with each item's state ---
    items.replaceChildren();
    if (total === 0) items.append(h('li', { class: 'empty class-empty' }, 'No routines or timers yet. Add them below.'));
    c.items.forEach((item, i) => {
      const state: ItemState = !run ? 'todo' : i < run.done ? 'done' : i === run.done && inProgress ? (playing ? 'now' : 'next') : 'todo';
      items.append(row(item, i, state, inProgress, total));
    });

    // --- Add routines and timers ---
    addPanel.hidden = inProgress;
    addPanel.replaceChildren(
      h('h2', { class: 'class-add-title' }, 'Add to the class'),
      h(
        'div',
        { class: 'class-add-groups' },
        h(
          'div',
          { class: 'class-add-group' },
          h('h3', {}, 'Routines'),
          app.routines.length
            ? h('div', { class: 'chips' }, ...app.routines.map((r) => h('button', { type: 'button', class: 'chip', dir: 'auto', 'data-testid': 'add-routine', 'data-id': r.id, onclick: () => add('routine', r.id) }, '+ ', h('bdi', {}, r.name))))
            : h('p', { class: 'hint' }, 'No routines yet.'),
        ),
        h(
          'div',
          { class: 'class-add-group' },
          h('h3', {}, 'Timers'),
          app.timers.length
            ? h('div', { class: 'chips' }, ...app.timers.map((t) => h('button', { type: 'button', class: 'chip', 'data-testid': 'add-timer', 'data-id': t.id, onclick: () => add('timer', t.id) }, `+ ${formatClock(t.durationSec)}`)))
            : h('p', { class: 'hint' }, 'No timers yet.'),
        ),
      ),
    );

    // --- Status line and buttons ---
    status.className = 'class-status';
    if (complete) {
      status.textContent = '✓ Class complete';
      status.classList.add('complete');
    } else if (inProgress) {
      status.textContent = playing ? `Paused at item ${run!.done + 1} of ${total}` : `${run!.done} of ${total} done`;
    } else {
      status.textContent = total ? `${total === 1 ? '1 item' : `${total} items`} will play one after the other` : 'Add routines and timers to start';
    }
    if (inProgress) {
      actions.replaceChildren(
        h('button', { type: 'button', class: 'btn btn-ghost', 'data-testid': 'end-class', onclick: () => void endClass() }, '■ End class'),
        h('button', { type: 'button', class: 'btn btn-ghost', 'data-testid': 'restart-class', onclick: () => void restart() }, '↻ Restart'),
        h('button', { type: 'button', class: 'btn btn-primary btn-class-start', 'data-testid': 'continue-class', onclick: () => app.continueClass() }, '▶ Continue class'),
      );
    } else {
      actions.replaceChildren(
        h('button', { type: 'button', class: 'btn btn-primary btn-class-start', 'data-testid': 'start-class', disabled: total === 0, onclick: () => app.startClass(classId) }, complete ? '▶ Start class again' : '▶ Start class'),
      );
    }
  }

  function row(item: ClassItem, i: number, state: ItemState, locked: boolean, total: number): HTMLElement {
    const r = resolveItem(item, app.routines, app.timers);
    if (!r) return h('li', {});
    const marker =
      state === 'done' ? h('span', { class: 'item-marker', 'aria-label': 'Done' }, '✓')
      : state === 'now' ? h('span', { class: 'item-marker', 'aria-label': 'Playing now' }, '▶')
      : h('span', { class: 'item-marker' }, String(i + 1));
    const tag =
      state === 'done' ? h('span', { class: 'item-state', 'data-testid': 'item-state' }, 'Done')
      : state === 'now' ? h('span', { class: 'item-state', 'data-testid': 'item-state' }, 'Playing now')
      : state === 'next' ? h('span', { class: 'item-state', 'data-testid': 'item-state' }, 'Up next')
      : null;
    const details =
      r.kind === 'routine'
        ? routineStats(r.routine).map(({ label, value }) => `${label} ${value}`).join(' · ')
        : timerTitle(r.timer);
    return h(
      'li',
      { class: `class-item state-${state}`, 'data-testid': 'class-item', 'data-state': state, 'data-kind': r.kind },
      marker,
      h(
        'div',
        { class: 'item-body' },
        h('div', { class: 'item-title-row' }, h('span', { class: `item-kind kind-${r.kind}` }, r.kind === 'routine' ? 'Routine' : 'Timer'), h('span', { class: 'item-name', dir: 'auto', 'data-testid': 'item-name' }, r.kind === 'routine' ? r.routine.name : formatClock(r.timer.durationSec)), tag),
        h('div', { class: 'item-details' }, details),
      ),
      h('div', { class: 'item-duration' }, formatClock(r.durationSec)),
      locked
        ? null
        : h(
            'div',
            { class: 'item-actions' },
            h('button', { type: 'button', class: 'btn btn-ghost item-btn', title: 'Move up', 'aria-label': 'Move up', 'data-testid': 'item-up', disabled: i === 0, onclick: () => move(i, -1) }, '↑'),
            h('button', { type: 'button', class: 'btn btn-ghost item-btn', title: 'Move down', 'aria-label': 'Move down', 'data-testid': 'item-down', disabled: i === total - 1, onclick: () => move(i, 1) }, '↓'),
            h('button', { type: 'button', class: 'btn btn-ghost btn-ghost-danger item-btn', title: 'Remove from the class', 'aria-label': 'Remove from the class', 'data-testid': 'item-remove', onclick: () => update((c) => ({ ...c, items: c.items.filter((x) => x.id !== item.id) })) }, '✕'),
          ),
    );
  }

  async function endClass(): Promise<void> {
    if (!(await confirmDialog('End this class? The ✓ marks are cleared.', 'End class'))) return;
    app.endClass();
    render();
  }

  async function restart(): Promise<void> {
    if (!(await confirmDialog('Start the class again from the first item?', 'Restart'))) return;
    app.startClass(classId);
  }

  render();
  return {
    el,
    onKey(e) {
      if (e.key !== 'Enter' || isTyping(e.target) || e.target instanceof HTMLButtonElement) return;
      const btn = actions.querySelector<HTMLButtonElement>('.btn-class-start');
      if (btn && !btn.disabled) {
        e.preventDefault();
        btn.click();
      }
    },
  };
}
