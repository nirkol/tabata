import { h } from './dom';

let open = false;

/** True while a confirmation dialog is shown (screens ignore their shortcuts then). */
export function isDialogOpen(): boolean {
  return open;
}

/**
 * Non-blocking "Are you sure?" dialog. Enter confirms, Esc cancels.
 * Unlike window.confirm() it doesn't freeze the page, so the timer keeps updating.
 */
export function confirmDialog(message: string, confirmLabel = 'Yes', cancelLabel = 'Cancel'): Promise<boolean> {
  return new Promise((resolve) => {
    open = true;
    const finish = (result: boolean) => {
      open = false;
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      resolve(result);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        finish(false);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        finish(true);
      }
    };
    const yes = h('button', { class: 'btn btn-danger', 'data-testid': 'confirm-yes', onclick: () => finish(true) }, confirmLabel);
    const overlay = h(
      'div',
      { class: 'dialog-overlay', role: 'dialog', 'aria-modal': 'true' },
      h(
        'div',
        { class: 'dialog' },
        h('p', { class: 'dialog-message' }, message),
        h(
          'div',
          { class: 'dialog-actions' },
          h('button', { class: 'btn', 'data-testid': 'confirm-no', onclick: () => finish(false) }, cancelLabel),
          yes,
        ),
      ),
    );
    document.addEventListener('keydown', onKey, true);
    document.body.append(overlay);
    yes.focus();
  });
}
