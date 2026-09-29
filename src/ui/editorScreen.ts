import {
  DEFAULT_FIELDS,
  LIMITS,
  createRoutine,
  isValidRoutine,
  nextRoutineName,
  validateName,
  type NumericField,
  type RoutineFields,
} from '../routines/model';
import { totalDurationSec } from '../timer/engine';
import { formatClock } from '../timer/format';
import type { App, Screen } from './app';
import { h } from './dom';
import { createNumberInput, type NumberInput } from './numberInput';

const FIELDS: { field: NumericField; label: string; kind: 'time' | 'int' }[] = [
  { field: 'workSec', label: 'Work time', kind: 'time' },
  { field: 'restSec', label: 'Rest time', kind: 'time' },
  { field: 'intervals', label: 'Intervals', kind: 'int' },
  { field: 'sets', label: 'Sets', kind: 'int' },
  { field: 'setRestSec', label: 'Rest between sets', kind: 'time' },
];

/** Routine editor (SPEC §5.2). `routineId` null creates a new routine. */
export function editorScreen(app: App, routineId: string | null): Screen {
  const existing = routineId ? app.routines.find((r) => r.id === routineId) : undefined;
  const fields: RoutineFields = existing
    ? { name: existing.name, workSec: existing.workSec, restSec: existing.restSec, intervals: existing.intervals, sets: existing.sets, setRestSec: existing.setRestSec }
    : { name: nextRoutineName(app.routines), ...DEFAULT_FIELDS };
  const invalid = new Set<keyof RoutineFields>();

  const nameInput = h('input', { id: 'name-input', class: 'text-input', type: 'text', maxlength: LIMITS.nameLength.max, autocomplete: 'off', 'data-testid': 'name-input' });
  nameInput.value = fields.name;
  const nameError = h('div', { class: 'field-error', 'data-testid': 'name-error' });
  nameInput.addEventListener('input', () => {
    fields.name = nameInput.value;
    const err = validateName(fields.name);
    nameError.textContent = err ?? '';
    nameInput.classList.toggle('invalid', !!err);
    if (err) invalid.add('name');
    else invalid.delete('name');
    update();
  });

  const total = h('div', { class: 'total-preview', 'data-testid': 'total-preview' });
  const save = h('button', { type: 'button', class: 'btn btn-primary', 'data-testid': 'save', onclick: () => doSave() }, 'Save');
  const inputs = {} as Record<NumericField, NumberInput>;

  for (const { field, label, kind } of FIELDS) {
    inputs[field] = createNumberInput({
      name: field,
      label,
      kind,
      value: fields[field],
      range: LIMITS[field],
      step: 1,
      holdStep: kind === 'time' ? 5 : 1,
      disabled: field === 'setRestSec' && fields.sets === 1,
      onChange: (v) => {
        if (v === null) invalid.add(field);
        else {
          invalid.delete(field);
          fields[field] = v;
        }
        if (field === 'sets') inputs.setRestSec?.setDisabled(v === 1 || (v === null && fields.sets === 1));
        update();
      },
    });
  }

  function currentlyValid(): boolean {
    const blocking = [...invalid].filter((f) => !(f === 'setRestSec' && fields.sets === 1));
    return blocking.length === 0 && isValidRoutine(fields);
  }

  function update(): void {
    if (fields.sets === 1) invalid.delete('setRestSec');
    total.textContent = `Total: ${formatClock(totalDurationSec(fields))}`;
    save.disabled = !currentlyValid();
  }

  function doSave(): void {
    if (!currentlyValid()) return;
    const clean = { ...fields, name: fields.name.trim() };
    if (existing) {
      app.saveRoutines(app.routines.map((r) => (r.id === existing.id ? { ...r, ...clean, updatedAt: new Date().toISOString() } : r)));
      app.setLastUsed(existing.id);
    } else {
      const created = createRoutine(clean);
      app.saveRoutines([...app.routines, created]);
      app.setLastUsed(created.id);
    }
    app.go({ name: 'list' });
  }

  const el = h(
    'section',
    { class: 'editor-screen' },
    h('div', { class: 'screen-header' }, h('h1', {}, existing ? 'Edit Routine' : 'New Routine')),
    h(
      'form',
      { class: 'editor-form', onsubmit: (e: Event) => e.preventDefault() },
      h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'name-input' }, 'Name'), nameInput, nameError),
      ...FIELDS.map(({ field }) => inputs[field].el),
      total,
      h('div', { class: 'form-actions' }, h('button', { type: 'button', class: 'btn', 'data-testid': 'cancel', onclick: () => app.go({ name: 'list' }) }, 'Cancel'), save),
    ),
  );
  update();
  queueMicrotask(() => nameInput.focus());
  return { el };
}
