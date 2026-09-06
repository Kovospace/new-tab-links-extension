import { toggleOverlay } from './wrappedHtmlElements';

/** One entry of the dropdown: what it reads as, and what picking it means. */
export interface SelectOption<VALUE> {
  label: string;
  value: VALUE;
}

/**
 * Asks the user to pick one of many, out of a dropdown.
 *
 * Neither of the other two dialogs can ask this. ChoiceDialog offers its answers as a row of
 * buttons, which is right for the three ways out of a device name clash and wrong for a list
 * that grows with the user - a profile can hold any number of workspaces. InputDialog is free
 * text, and this question has a closed set of answers that the user should not have to spell.
 *
 * The chosen value is carried by the option rather than by the `<option>` element, which only
 * ever holds an index, so VALUE need not be a string.
 *
 * Resolves to the chosen value, or null when the dialog is cancelled or dismissed.
 */
export class SelectDialog<VALUE> {

  private readonly title: string;
  private readonly label: string;
  private readonly options: ReadonlyArray<SelectOption<VALUE>>;
  private readonly confirmLabel: string;

  private dialogEl: HTMLDialogElement | null = null;

  /**
   * @param title         heading of the dialog
   * @param label         what the dropdown is asking for
   * @param options       the answers, in the order they should be offered
   * @param confirmLabel  wording of the confirming button, when "OK" is not specific enough
   */
  constructor(
    title: string,
    label: string,
    options: ReadonlyArray<SelectOption<VALUE>>,
    confirmLabel: string = 'OK'
  ) {
    this.title = title;
    this.label = label;
    this.options = options;
    this.confirmLabel = confirmLabel;
  }

  /**
   * Shows the dialog and waits for an answer.
   *
   * @return the chosen value, or null when the user cancelled or dismissed the dialog
   */
  public ask(): Promise<VALUE | null> {
    return new Promise<VALUE | null>(resolve => {
      let answered = false;

      const settle = (value: VALUE | null): void => {
        if (answered) return;
        answered = true;
        this.hide();
        resolve(value);
      };

      this.dialogEl = this.build(settle);
      document.body.appendChild(this.dialogEl);
      // Cancel, Escape and the backdrop all end in the element's own close event.
      this.dialogEl.addEventListener('close', () => settle(null));
      this.dialogEl.showModal();
      this.dialogEl.querySelector('select')?.focus();
      toggleOverlay(true);
    });
  }

  private hide(): void {
    toggleOverlay(false);
    // Closed before it is removed: a modal <dialog> is in the browser's top layer, and taking
    // the element out from under that leaves the layer holding a node nothing points at.
    this.dialogEl?.close();
    this.dialogEl?.remove();
    this.dialogEl = null;
  }

  private build(settle: (value: VALUE | null) => void): HTMLDialogElement {
    const dialog = document.createElement('dialog');
    dialog.classList.add('input-dialog', 'select-dialog');

    const heading = document.createElement('h2');
    heading.classList.add('input-dialog__title');
    heading.textContent = this.title;
    dialog.appendChild(heading);

    const form = document.createElement('form');
    form.method = 'dialog';
    form.classList.add('input-dialog__form');

    const fieldId = 'select-dialog-field';

    const wrapper = document.createElement('div');
    wrapper.classList.add('input-dialog__field');

    const labelEl = document.createElement('label');
    labelEl.classList.add('input-dialog__label');
    labelEl.htmlFor = fieldId;
    labelEl.textContent = this.label;

    const select = document.createElement('select');
    select.id = fieldId;
    select.classList.add('editable', 'input-dialog__input', 'input-dialog__select');
    this.options.forEach((option, index) => {
      const optionEl = document.createElement('option');
      optionEl.value = String(index);
      optionEl.textContent = option.label;
      select.appendChild(optionEl);
    });

    wrapper.appendChild(labelEl);
    wrapper.appendChild(select);
    form.appendChild(wrapper);

    const actions = document.createElement('div');
    actions.classList.add('input-dialog__actions');

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.classList.add('danger');
    cancelBtn.addEventListener('click', () => settle(null));

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.textContent = this.confirmLabel;
    confirmBtn.classList.add('add');
    confirmBtn.addEventListener('click', () => settle(this.chosen(select)));

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
    form.appendChild(actions);
    dialog.appendChild(form);

    // Enter anywhere in the form confirms, the way it does in the input dialog
    form.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        settle(this.chosen(select));
      }
    });

    // click on the backdrop (outside the dialog box) dismisses it
    dialog.addEventListener('click', (e: MouseEvent) => {
      if (e.target === dialog) settle(null);
    });

    return dialog;
  }

  /** The option the dropdown is standing on, or null when there was nothing to stand on. */
  private chosen(select: HTMLSelectElement): VALUE | null {
    const option = this.options[Number(select.value)];
    return option ? option.value : null;
  }
}
