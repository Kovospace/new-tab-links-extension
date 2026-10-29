/**
 *  Closes a modal dialog when its backdrop is clicked - and only then (#161, #162).
 *
 *  **Why not `click` alone.** A click is delivered to the nearest element the press and the
 *  release have in common. Selecting text in a field and letting go a few millimetres past the
 *  dialog's edge, or on its padding, makes that element the `<dialog>` itself - which is exactly
 *  what a backdrop click looks like. Every dialog here closed on it, with whatever was typed.
 *
 *  So the gesture is judged where it started and where it ended: both the press and the release
 *  have to land on the dialog element, which with a modal dialog means the backdrop or the
 *  dialog's own padding, never anything inside it.
 */
export function dismissOnBackdropClick(dialog: HTMLDialogElement, dismiss: () => void): void {

  let pressedOnBackdrop = false;
  let releasedOnBackdrop = false;

  dialog.addEventListener('pointerdown', event => {
    pressedOnBackdrop = event.target === dialog;
    releasedOnBackdrop = false;
  });
  dialog.addEventListener('pointerup', event => {
    releasedOnBackdrop = event.target === dialog;
  });
  dialog.addEventListener('click', event => {
    const fromBackdrop = event.target === dialog && pressedOnBackdrop && releasedOnBackdrop;
    pressedOnBackdrop = false;
    releasedOnBackdrop = false;
    if (fromBackdrop) dismiss();
  });
}
