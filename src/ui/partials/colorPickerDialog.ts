import {
  TAB_GROUP_COLORS, TabGroupColor, TabGroupColorSwatch
} from '../../backend/entity/TabGroupColors';
import { t } from '../../i18n/i18n';

/**
 * Picks the colour Chrome paints a subgroup's tab group.
 *
 * **It offers nine colours and no more, and that is the browser's decision.**
 * `chrome.tabGroups.update()` takes a name out of its own list and refuses anything else, so a
 * wheel or a hex box here would let someone choose a colour the tab strip would then ignore.
 * The dialog says so in a line under the swatches rather than leaving it to be discovered.
 *
 * A <dialog> in the input dialog's frame, like every other question this extension asks, and
 * answered by clicking: a colour needs no confirming step, and one click beats two.
 */
export class ColorPickerDialog {

  private readonly current: TabGroupColor | undefined;
  private readonly subgroupTitle: string;

  private dialogEl: HTMLDialogElement | null = null;

  /**
   * @param subgroupTitle what is being coloured, so the dialog says what it is about
   * @param current       the colour it has now, marked in the list
   */
  constructor(subgroupTitle: string, current: TabGroupColor | undefined) {
    this.subgroupTitle = subgroupTitle;
    this.current = current;
  }

  /**
   * Shows the picker and waits for an answer.
   *
   * @return the colour chosen, or null when the dialog was cancelled or dismissed
   */
  public ask(): Promise<TabGroupColor | null> {
    return new Promise<TabGroupColor | null>(resolve => {
      let answered = false;

      const settle = (color: TabGroupColor | null): void => {
        if (answered) return;
        answered = true;
        this.hide();
        resolve(color);
      };

      this.dialogEl = this.build(settle);
      document.body.appendChild(this.dialogEl);
      // Cancel, Escape and the backdrop all end in the element's own close event.
      this.dialogEl.addEventListener('close', () => settle(null));
      this.dialogEl.showModal();
    });
  }

  private hide(): void {
    // Closed before it is removed: a modal <dialog> is in the browser's top layer, and taking
    // the element out from under that leaves the layer holding a node nothing points at.
    this.dialogEl?.close();
    this.dialogEl?.remove();
    this.dialogEl = null;
  }

  private build(settle: (color: TabGroupColor | null) => void): HTMLDialogElement {

    const dialog = document.createElement('dialog');
    dialog.classList.add('input-dialog', 'color-picker');

    const heading = document.createElement('h2');
    heading.classList.add('input-dialog__title');
    heading.textContent = t('subgroup.colorDialog.title');
    dialog.appendChild(heading);

    const subject = document.createElement('p');
    subject.classList.add('color-picker__subject');
    subject.textContent =
      t('subgroup.colorDialog.explanation', { name: this.subgroupTitle });
    dialog.appendChild(subject);

    const grid = document.createElement('div');
    grid.classList.add('color-picker__grid');
    TAB_GROUP_COLORS.forEach(swatch => grid.appendChild(this.buildSwatch(swatch, settle)));
    dialog.appendChild(grid);

    const note = document.createElement('p');
    note.classList.add('color-picker__note');
    // Said here because it is the obvious question, and the honest answer is short.
    note.textContent = t('subgroup.colorDialog.note');
    dialog.appendChild(note);

    const actions = document.createElement('div');
    actions.classList.add('input-dialog__actions', 'color-picker__actions');

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = t('common.cancel');
    cancelBtn.classList.add('danger');
    cancelBtn.addEventListener('click', () => settle(null));

    actions.appendChild(cancelBtn);
    dialog.appendChild(actions);

    // click on the backdrop (outside the dialog box) dismisses it
    dialog.addEventListener('click', event => {
      if (event.target === dialog) settle(null);
    });

    return dialog;
  }

  /** One colour: the colour itself, its name, and a mark when it is the one in use. */
  private buildSwatch(
    swatch: TabGroupColorSwatch,
    settle: (color: TabGroupColor | null) => void
  ): HTMLElement {

    const button = document.createElement('button');
    button.type = 'button';
    button.classList.add('color-picker__swatch');
    button.title = t(`subgroup.colorDialog.colors.${swatch.color}`);
    button.value = swatch.color;
    if (swatch.color === this.current) {
      button.classList.add('color-picker__swatch--current');
      button.setAttribute('aria-current', 'true');
    }

    const dot = document.createElement('span');
    dot.classList.add('color-picker__dot');
    dot.style.backgroundColor = swatch.hex;

    const label = document.createElement('span');
    label.classList.add('color-picker__label');
    label.textContent = t(`subgroup.colorDialog.colors.${swatch.color}`);

    button.appendChild(dot);
    button.appendChild(label);
    button.addEventListener('click', () => settle(swatch.color));

    return button;
  }
}
