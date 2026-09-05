import { toggleOverlay } from './wrappedHtmlElements';

export type FieldType = 'string' | 'url' | 'password';

export type FieldMap = Record<string, FieldType>;

type FieldValues = Record<string, string>;

/** "Give link title" → "giveLinkTitle" */
function toCamelCase(label: string): string {
  const words = label.trim().split(/[\s_\-]+/);
  return words
    .map((word, i) =>
      i === 0
        ? word.toLowerCase()
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
    .join('');
}

function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  return trimmed.includes('://') ? trimmed : `https://${trimmed}`;
}

function buildInput(type: FieldType, id: string, placeholder: string): HTMLInputElement {
  const input = document.createElement('input');
  input.id = id;
  input.placeholder = placeholder;
  input.classList.add('editable', 'input-dialog__input');
  input.type = type === 'password' ? 'password' : 'text';
  return input;
}

export class InputDialog {

  private readonly title: string | undefined;
  private readonly fields: FieldMap;
  private readonly onConfirm: (values: FieldValues) => void;

  private dialogEl: HTMLDialogElement | null = null;
  private pendingAnswer: ((values: FieldValues | null) => void) | null = null;

  constructor(title: string | null | undefined, fields: FieldMap, onConfirm: (values: FieldValues) => void) {
    this.title = title ?? undefined;
    this.fields = fields;
    this.onConfirm = onConfirm;
  }

  show(prefill?: FieldValues): void {
    this.dialogEl = this.build(this.title, prefill);
    document.body.appendChild(this.dialogEl);
    this.dialogEl.showModal();
    this.dialogEl.querySelector<HTMLInputElement>('input')?.focus();
    toggleOverlay(true);
  }

  /**
   * Shows the dialog and waits for it to be finished with, rather than calling back.
   *
   * The callback form cannot be waited on, and a caller that has to know when the user is done
   * needs to - the first-run screen reloads the page the moment signing in resolves, and a
   * dialog opened during that would be torn off the screen mid-answer. Confirming still runs
   * the constructor's callback, so nothing that already uses show() changes.
   *
   * @param prefill values to put in the fields before showing them
   * @return the entered values, or null when the dialog was cancelled or dismissed
   */
  ask(prefill?: FieldValues): Promise<FieldValues | null> {
    return new Promise<FieldValues | null>(resolve => {
      let answered = false;
      const settle = (values: FieldValues | null): void => {
        if (answered) return;
        answered = true;
        resolve(values);
      };

      this.pendingAnswer = settle;
      this.show(prefill);
      // Covers every way out that is not the OK button: Cancel, Escape and the backdrop all
      // end in the element's own close event.
      this.dialogEl?.addEventListener('close', () => settle(null));
    });
  }

  hide(): void {
    if (!this.dialogEl) return;
    this.dialogEl.close();
  }

  private build(title?: string, prefill?: FieldValues): HTMLDialogElement {
    const dialog = document.createElement('dialog');
    dialog.classList.add('input-dialog');

    if (title) {
      const heading = document.createElement('h2');
      heading.classList.add('input-dialog__title');
      heading.textContent = title;
      dialog.appendChild(heading);
    }

    const form = document.createElement('form');
    form.method = 'dialog';
    form.classList.add('input-dialog__form');

    const inputRefs: Array<{ camelKey: string; type: FieldType; el: HTMLInputElement }> = [];

    Object.entries(this.fields).forEach(([label, type], idx) => {
      const fieldId = `input-dialog-field-${idx}`;

      const wrapper = document.createElement('div');
      wrapper.classList.add('input-dialog__field');

      const labelEl = document.createElement('label');
      labelEl.classList.add('input-dialog__label');
      labelEl.htmlFor = fieldId;
      labelEl.textContent = label;

      const input = buildInput(type, fieldId, label);
      if (prefill?.[toCamelCase(label)] !== undefined) input.value = prefill[toCamelCase(label)];

      wrapper.appendChild(labelEl);
      wrapper.appendChild(input);
      form.appendChild(wrapper);

      inputRefs.push({ camelKey: toCamelCase(label), type, el: input });
    });

    const actions = document.createElement('div');
    actions.classList.add('input-dialog__actions');

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.classList.add("danger");
    cancelBtn.addEventListener('click', () => this.hide());

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.textContent = 'OK';
    confirmBtn.classList.add('add');
    confirmBtn.addEventListener('click', () => this.confirm(inputRefs));

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
    form.appendChild(actions);
    dialog.appendChild(form);

    // Enter on any input triggers confirm
    form.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.confirm(inputRefs);
      }
    });

    // click on the backdrop (outside the dialog box) closes it
    dialog.addEventListener('click', (e: MouseEvent) => {
      if (e.target === dialog) this.hide();
    });

    // clean up DOM when closed (including native Escape key and backdrop click)
    dialog.addEventListener('close', () => {
      toggleOverlay(false);
      dialog.remove();
      this.dialogEl = null;
    });

    return dialog;
  }

  private confirm(inputRefs: Array<{ camelKey: string; type: FieldType; el: HTMLInputElement }>): void {
    const values: FieldValues = {};
    for (const { camelKey, type, el } of inputRefs) {
      values[camelKey] = type === 'url' ? normalizeUrl(el.value) : el.value;
    }
    this.hide();
    const answer = this.pendingAnswer;
    this.pendingAnswer = null;
    this.onConfirm(values);
    answer?.(values);
  }
}