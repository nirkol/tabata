import { CLASS_NAME_MAX, classDurationSec, createClass, createClassItem, nextClassName, resolveItem, type ClassItem, type WorkoutClass } from '../classes/model';
import { routineStats, type Routine } from '../routines/model';
import { totalDurationSec } from '../timer/engine';
import { formatClock } from '../timer/format';
import { timerTitle, type PresetTimer } from '../timers/model';
import type { App, Screen } from './app';
import { confirmDialog } from './dialog';
import { h, isTyping } from './dom';

type ItemState = 'done' | 'now' | 'next' | 'todo';

/** "3 items · Total 12:40" */
function summaryText(app: App, c: Pick<WorkoutClass, 'items'>): string {
  const n = c.items.length;
  return `${n === 1 ? '1 item' : `${n} items`} · Total ${formatClock(classDurationSec(c, app.routines, app.timers))}`;
}

/**
 * One item of a class. In the editor it has ↑ / ↓ / ✕ buttons; on the class page it shows
 * its state (done, playing now, up next).
 */
function itemRow(app: App, item: ClassItem, i: number, state: ItemState, actions: HTMLElement | null): HTMLElement {
  const r = resolveItem(item, app.routines, app.timers);
  if (!r) return h('li', {});
  const marker =
    state === 'done' ? h('span', { class: 'item-marker', 'aria-label': 'Done' }, '✓')
    : state === 'now' ? h('span', { class: 'item-marker', 'aria-label': 'Playing now' }, '▶')
    : h('span', { class: 'item-marker' }, String(i + 1));
  const tagText = { done: 'Done', now: 'Playing now', next: 'Up next', todo: '' }[state];
  const details =
    r.kind === 'routine' ? routineStats(r.routine).map(({ label, value }) => `${label} ${value}`).join(' · ') : timerTitle(r.timer);
  return h(
    'li',
    { class: `class-item state-${state}`, 'data-testid': 'class-item', 'data-state': state, 'data-kind': r.kind },
    marker,
    h(
      'div',
      { class: 'item-body' },
      h(
        'div',
        { class: 'item-title-row' },
        h('span', { class: `item-kind kind-${r.kind}` }, r.kind === 'routine' ? 'Routine' : 'Timer'),
        h('span', { class: 'item-name', dir: 'auto', 'data-testid': 'item-name' }, r.kind === 'routine' ? r.routine.name : formatClock(r.timer.durationSec)),
        tagText ? h('span', { class: 'item-state', 'data-testid': 'item-state' }, tagText) : null,
      ),
      h('div', { class: 'item-details' }, details),
    ),
    h('div', { class: 'item-duration' }, formatClock(r.durationSec)),
    actions,
  );
}

/** The class page (SPEC §5d): the saved list with each item's progress, and Start / Continue class. */
export function classScreen(app: App, classId: string): Screen {
  const cls = (): WorkoutClass | undefined => app.classes.find((c) => c.id === classId);

  const title = h('h1', { class: 'class-title', dir: 'auto', 'data-testid': 'class-title' });
  const summary = h('p', { class: 'list-count', 'data-testid': 'class-summary' });
  const editBtn = h('button', { type: 'button', class: 'btn btn-pill', 'data-testid': 'edit-class', onclick: () => app.go({ name: 'classEditor', classId }) }, '✎ Edit class');
  const items = h('ol', { class: 'class-items', 'data-testid': 'class-items' });
  const status = h('div', { class: 'class-status', 'data-testid': 'class-status' });
  const actions = h('div', { class: 'class-actions' });

  const el = h(
    'section',
    { class: 'class-screen', 'data-testid': 'class-screen' },
    h('button', { type: 'button', class: 'btn btn-ghost class-back', 'data-testid': 'all-classes', onclick: () => app.go({ name: 'classes' }) }, '← All classes'),
    h('div', { class: 'class-head' }, h('div', { class: 'class-head-name' }, title, summary), editBtn),
    items,
    h('div', { class: 'class-footer' }, status, actions),
  );

  function render(): void {
    const c = cls();
    if (!c) return;
    const run = app.classRun?.classId === classId ? app.classRun : null;
    const total = c.items.length;
    const complete = !!run && total > 0 && run.done >= total;
    const inProgress = !!run && !complete;
    const playing = inProgress && app.hasClassSession();

    title.textContent = c.name;
    summary.textContent = summaryText(app, c);
    // The list can't be changed while the class is in progress.
    editBtn.disabled = inProgress;
    editBtn.title = inProgress ? 'End the class to edit it' : '';

    items.replaceChildren();
    if (total === 0) items.append(h('li', { class: 'empty class-empty' }, 'This class is empty. Click “Edit class” to add routines and timers.'));
    c.items.forEach((item, i) => {
      const state: ItemState = !run ? 'todo' : i < run.done ? 'done' : i === run.done && inProgress ? (playing ? 'now' : 'next') : 'todo';
      items.append(itemRow(app, item, i, state, null));
    });

    status.className = 'class-status';
    if (complete) {
      status.textContent = '✓ Class complete';
      status.classList.add('complete');
    } else if (inProgress) {
      status.textContent = playing ? `Paused at item ${run!.done + 1} of ${total}` : `${run!.done} of ${total} done`;
    } else {
      status.textContent = `${total === 1 ? '1 item' : `${total} items`} will play one after the other`;
    }
    if (inProgress) {
      actions.replaceChildren(
        h('button', { type: 'button', class: 'btn btn-ghost', 'data-testid': 'end-class', onclick: () => endClass() }, '■ End class'),
        h('button', { type: 'button', class: 'btn btn-ghost', 'data-testid': 'restart-class', onclick: () => void restart() }, '↻ Restart'),
        h('button', { type: 'button', class: 'btn btn-primary btn-class-start', 'data-testid': 'continue-class', onclick: () => app.continueClass() }, '▶ Continue class'),
      );
    } else {
      actions.replaceChildren(
        h('button', { type: 'button', class: 'btn btn-primary btn-class-start', 'data-testid': 'start-class', disabled: total === 0, onclick: () => app.startClass(classId) }, complete ? '▶ Start class again' : '▶ Start class'),
      );
    }
  }

  /** End class: no confirmation. */
  /** End class: clears the progress and goes back to the list of classes. */
  function endClass(): void {
    app.endClass();
    app.go({ name: 'classes' });
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

/**
 * The class editor (SPEC §5d): name the class and pick its routines and timers. Nothing is
 * stored until Save class; only a saved class is listed and can be started.
 */
export function classEditorScreen(app: App, classId: string | null): Screen {
  const existing = classId ? app.classes.find((c) => c.id === classId) : undefined;
  const draft: WorkoutClass = existing ? { ...existing, items: [...existing.items] } : createClass(nextClassName(app.classes));
  const original = JSON.stringify({ name: draft.name, items: draft.items });
  const dirty = () => JSON.stringify({ name: draft.name.trim(), items: draft.items }) !== original;

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
  nameInput.value = draft.name;
  const nameError = h('div', { class: 'field-error', 'data-testid': 'class-name-error' });
  const summary = h('p', { class: 'list-count', 'data-testid': 'class-summary' });
  const items = h('ol', { class: 'class-items', 'data-testid': 'class-items' });
  const addPanel = h('div', { class: 'class-add', 'data-testid': 'class-add' });
  const status = h('div', { class: 'class-status', 'data-testid': 'class-status' });
  const saveBtn = h('button', { type: 'button', class: 'btn btn-primary btn-class-start', 'data-testid': 'save-class', onclick: () => save() }, '✓ Save class');
  const cancelBtn = h('button', { type: 'button', class: 'btn btn-ghost', 'data-testid': 'cancel-class', onclick: () => void cancel() }, 'Cancel');

  const el = h(
    'section',
    { class: 'class-screen class-editor', 'data-testid': 'class-editor' },
    h('h1', { class: 'class-editor-title' }, existing ? 'Edit class' : 'New class'),
    h('div', { class: 'class-head' }, h('div', { class: 'class-head-name' }, nameInput, nameError), summary),
    items,
    addPanel,
    h('div', { class: 'class-footer' }, status, h('div', { class: 'class-actions' }, cancelBtn, saveBtn)),
  );

  nameInput.addEventListener('input', () => {
    draft.name = nameInput.value;
    renderFooter();
  });

  function renderFooter(): void {
    const nameOk = draft.name.trim().length > 0;
    nameError.textContent = nameOk ? '' : 'Name is required';
    nameInput.classList.toggle('invalid', !nameOk);
    const empty = draft.items.length === 0;
    saveBtn.disabled = !nameOk || empty;
    status.textContent = empty ? 'Add at least one routine or timer' : !nameOk ? 'Give the class a name' : 'Save the class to add it to your classes';
  }

  function move(index: number, delta: number): void {
    const to = index + delta;
    if (to < 0 || to >= draft.items.length) return;
    draft.items.splice(to, 0, ...draft.items.splice(index, 1));
    render();
    items.querySelectorAll<HTMLButtonElement>(`[data-testid="${delta < 0 ? 'item-up' : 'item-down'}"]`)[to]?.focus();
  }

  function add(kind: ClassItem['kind'], refId: string): void {
    draft.items.push(createClassItem(kind, refId));
    render();
    const added = items.lastElementChild as HTMLElement | null;
    added?.classList.add('just-added');
    added?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function remove(id: string): void {
    draft.items = draft.items.filter((x) => x.id !== id);
    render();
  }

  function render(): void {
    summary.textContent = summaryText(app, draft);
    items.replaceChildren();
    const total = draft.items.length;
    if (total === 0) items.append(h('li', { class: 'empty class-empty' }, 'No routines or timers yet. Add them from the lists below.'));
    draft.items.forEach((item, i) => {
      const buttons = h(
        'div',
        { class: 'item-actions' },
        h('button', { type: 'button', class: 'btn btn-ghost item-btn', title: 'Move up', 'aria-label': 'Move up', 'data-testid': 'item-up', disabled: i === 0, onclick: () => move(i, -1) }, '↑'),
        h('button', { type: 'button', class: 'btn btn-ghost item-btn', title: 'Move down', 'aria-label': 'Move down', 'data-testid': 'item-down', disabled: i === total - 1, onclick: () => move(i, 1) }, '↓'),
        h('button', { type: 'button', class: 'btn btn-ghost btn-ghost-danger item-btn', title: 'Remove from the class', 'aria-label': 'Remove from the class', 'data-testid': 'item-remove', onclick: () => remove(item.id) }, '✕'),
      );
      items.append(itemRow(app, item, i, 'todo', buttons));
    });

    const uses = (kind: ClassItem['kind'], id: string) => draft.items.filter((x) => x.kind === kind && x.refId === id).length;
    addPanel.replaceChildren(
      h('h2', { class: 'class-add-title' }, 'Add to the class', h('span', { class: 'class-add-sub' }, 'Click a routine or timer to add it to the end of the list')),
      // Two lists side by side: routines on the left, timers on the right.
      h(
        'div',
        { class: 'class-add-cols' },
        h(
          'div',
          { class: 'class-add-col', 'data-testid': 'pick-routines' },
          h('h3', { class: 'class-add-heading' }, `Routines (${app.routines.length})`),
          app.routines.length
            ? h('div', { class: 'pick-list' }, ...app.routines.map((r) => routineOption(r, uses('routine', r.id))))
            : h('p', { class: 'hint' }, 'No routines yet. Create them on the Routines tab.'),
        ),
        h(
          'div',
          { class: 'class-add-col', 'data-testid': 'pick-timers' },
          h('h3', { class: 'class-add-heading' }, `Timers (${app.timers.length})`),
          app.timers.length
            ? h('div', { class: 'pick-list' }, ...app.timers.map((t) => timerOption(t, uses('timer', t.id))))
            : h('p', { class: 'hint' }, 'No timers yet. Create them on the Timers tab.'),
        ),
      ),
    );
    renderFooter();
  }

  /** "In class ×2" when the routine or timer is already in the list. */
  const usedBadge = (n: number) => (n ? h('span', { class: 'pick-used', 'data-testid': 'pick-used' }, n === 1 ? 'In class' : `In class ×${n}`) : null);

  /** A routine to add: its name, every value and its total time. */
  function routineOption(r: Routine, used: number): HTMLElement {
    return h(
      'button',
      { type: 'button', class: 'pick' + (used ? ' pick-in' : ''), 'data-testid': 'add-routine', 'data-id': r.id, 'aria-label': `Add “${r.name}” to the class`, onclick: () => add('routine', r.id) },
      h('span', { class: 'pick-head' }, h('span', { class: 'pick-name', dir: 'auto' }, r.name), usedBadge(used)),
      h(
        'span',
        { class: 'pick-stats' },
        ...routineStats(r).map(({ label, value }) => h('span', { class: 'pick-stat' }, h('span', { class: 'pick-stat-label' }, label), h('span', { class: 'pick-stat-value' }, value))),
      ),
      h('span', { class: 'pick-foot' }, h('span', { class: 'pick-total' }, 'Total ', h('b', {}, formatClock(totalDurationSec(r)))), h('span', { class: 'pick-add' }, '+ Add')),
    );
  }

  /** A timer to add: its duration, large. */
  function timerOption(t: PresetTimer, used: number): HTMLElement {
    return h(
      'button',
      { type: 'button', class: 'pick pick-timer' + (used ? ' pick-in' : ''), 'data-testid': 'add-timer', 'data-id': t.id, 'aria-label': `Add the ${timerTitle(t)} timer to the class`, onclick: () => add('timer', t.id) },
      h('span', { class: 'pick-duration' }, formatClock(t.durationSec)),
      h('span', { class: 'pick-timer-info' }, h('span', { class: 'pick-total' }, timerTitle(t)), usedBadge(used)),
      h('span', { class: 'pick-add' }, '+ Add'),
    );
  }

  function save(): void {
    const name = draft.name.trim();
    if (!name || draft.items.length === 0) return;
    const saved: WorkoutClass = { ...draft, name, updatedAt: new Date().toISOString() };
    // Editing a class clears its ✓ marks from an earlier play.
    if (app.classRun?.classId === saved.id) app.endClass();
    app.saveClasses(existing ? app.classes.map((c) => (c.id === saved.id ? saved : c)) : [...app.classes, saved]);
    app.go({ name: 'classes' });
  }

  async function cancel(): Promise<void> {
    if (dirty() && !(await confirmDialog('Discard the changes to this class?', 'Discard'))) return;
    if (existing) app.go({ name: 'class', classId: existing.id });
    else app.go({ name: 'classes' });
  }

  render();
  requestAnimationFrame(() => {
    if (!existing) nameInput.select();
  });
  // Like the routine editor, it can only be left with Save class or Cancel.
  return { el, lockNav: 'Save or cancel the class first' };
}
