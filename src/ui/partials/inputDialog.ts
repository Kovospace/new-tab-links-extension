import { toggleOverlay } from './wrappedHtmlElements';
import {
  FieldConstraints, FieldType, normalizeUrl, validateFields
} from './fieldValidation';

export type { FieldType } from './fieldValidation';

/**
 * What one field of the dialog is: its type on its own, or its type with constraints.
 *
 * The bare type is still accepted because most fields have nothing to say beyond it, and
 * writing `{ type: 'string' }` at every call site would bury the fields that do.
 */
export type FieldSpec = FieldType | FieldConstraints;

export type FieldMap = Record<string, FieldSpec>;

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

/** The constraints of a field, however the caller chose to write them. */
function constraintsOf(spec: FieldSpec): FieldConstraints {
  return typeof spec === 'string' ? { type: spec } : spec;
}

function buildInput(type: FieldType, id: string, placeholder: string): HTMLInputElement {
  const input = document.createElement('input');
  input.id = id;
  input.placeholder = placeholder;
  input.classList.add('editable', 'input-dialog__input');
  input.type = type === 'password' ? 'password' : 'text';
  return input;
}

/** One field of the dialog, and everything about it the dialog has to keep hold of. */
interface FieldRef {
  camelKey: string;
  label: string;
  constraints: FieldConstraints;
  el: HTMLInputElement;
  errorEl: HTMLElement;
  /** Whether the user has touched it yet; an untouched field is not told off. */
  touched: boolean;
}

/**
 * The dialog every creation and rename in this extension is asked through.
 *
 * **It refuses to submit a form it knows is wrong.** The constraints are the account's -
 * a name is 120 characters because the backend's column is - and they are checked here rather
 * than after the fact for a reason that is not politeness: `@Size` is validated over the whole
 * push, so one over-long name fails the entire batch with a 400 and nothing is applied. It
 * would sit in local state stopping every other change from reaching the account. The rules
 * themselves live in `fieldValidation.ts`, where they can be tested.
 *
 * **A dialog does not open shouting.** An empty required field is a reason to leave the
 * confirming button disabled, and not yet a reason to print a complaint under a field the user
 * has not reached: the message appears once a field has been touched, or as soon as somebody
 * tries to confirm anyway.
 */
export class InputDialog {

  private readonly title: string | undefined;
  private readonly fields: FieldMap;
  private readonly onConfirm: (values: FieldValues) => void;

  private dialogEl: HTMLDialogElement | null = null;
  private pendingAnswer: ((values: FieldValues | null) => void) | null = null;

  private fieldRefs: FieldRef[] = [];
  private confirmBtn: HTMLButtonElement | null = null;

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

    this.fieldRefs = [];

    Object.entries(this.fields).forEach(([label, spec], idx) => {
      const fieldId = `input-dialog-field-${idx}`;
      const constraints = constraintsOf(spec);

      const wrapper = document.createElement('div');
      wrapper.classList.add('input-dialog__field');

      const labelEl = document.createElement('label');
      labelEl.classList.add('input-dialog__label');
      labelEl.htmlFor = fieldId;
      labelEl.textContent = constraints.required ? `${label} *` : label;

      const input = buildInput(constraints.type, fieldId, label);
      if (prefill?.[toCamelCase(label)] !== undefined) input.value = prefill[toCamelCase(label)];

      const errorEl = document.createElement('span');
      errorEl.classList.add('input-dialog__error');
      errorEl.hidden = true;

      wrapper.appendChild(labelEl);
      wrapper.appendChild(input);
      wrapper.appendChild(errorEl);
      form.appendChild(wrapper);

      const ref: FieldRef = {
        camelKey: toCamelCase(label),
        label,
        constraints,
        el: input,
        errorEl,
        // A field arriving with a value was filled in by whoever opened the dialog - a rename
        // prefills the current name - so it has something to say about itself already.
        touched: (prefill?.[toCamelCase(label)] ?? '') !== ''
      };
      this.fieldRefs.push(ref);

      input.addEventListener('input', () => {
        ref.touched = true;
        this.revalidate();
      });
      // Leaving a field the user has been in is the moment to say what is wrong with it, even
      // if they never typed anything.
      input.addEventListener('blur', () => {
        ref.touched = true;
        this.revalidate();
      });
    });

    const actions = document.createElement('div');
    actions.classList.add('input-dialog__actions');

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.classList.add("danger");
    cancelBtn.addEventListener('click', () => this.hide());

    this.confirmBtn = document.createElement('button');
    this.confirmBtn.type = 'button';
    this.confirmBtn.textContent = 'OK';
    this.confirmBtn.classList.add('add');
    this.confirmBtn.addEventListener('click', () => this.confirm());

    actions.appendChild(cancelBtn);
    actions.appendChild(this.confirmBtn);
    form.appendChild(actions);
    dialog.appendChild(form);

    // Enter on any input triggers confirm
    form.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.confirm();
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
      this.fieldRefs = [];
      this.confirmBtn = null;
    });

    // The button starts out reflecting the form it is looking at, which for an empty required
    // field means disabled.
    this.revalidate();

    return dialog;
  }

  /** What is in the fields right now, keyed the way the callback receives them. */
  private currentValues(): FieldValues {
    const values: FieldValues = {};
    for (const ref of this.fieldRefs) {
      values[ref.camelKey] = ref.el.value;
    }
    return values;
  }

  /**
   * Re-checks every field, shows what is wrong with the ones that have been touched, and
   * enables the confirming button only when nothing is.
   *
   * @return the problems found, whether or not they are being shown
   */
  private revalidate(): Record<string, string> {

    const problems = validateFields(
      this.currentValues(),
      Object.fromEntries(this.fieldRefs.map(ref => [ref.camelKey, ref.constraints])),
      Object.fromEntries(this.fieldRefs.map(ref => [ref.camelKey, ref.label])));

    for (const ref of this.fieldRefs) {
      const problem = problems[ref.camelKey];
      const showing = Boolean(problem) && ref.touched;
      ref.errorEl.textContent = problem ?? '';
      ref.errorEl.hidden = !showing;
      ref.el.classList.toggle('input-dialog__input--invalid', showing);
    }

    if (this.confirmBtn) {
      this.confirmBtn.disabled = Object.keys(problems).length > 0;
    }

    return problems;
  }

  /**
   * Takes the answer, if the form is fit to give one.
   *
   * Enter reaches here as well as the button does, and a disabled button does not stop a
   * keypress - so this refuses on its own rather than trusting that it was not called. When it
   * refuses it stops hiding the problems, because at this point the user has plainly finished
   * and is owed the reason.
   */
  private confirm(): void {

    for (const ref of this.fieldRefs) {
      ref.touched = true;
    }

    if (Object.keys(this.revalidate()).length > 0) {
      this.firstInvalidField()?.focus();
      return;
    }

    const values: FieldValues = {};
    for (const { camelKey, constraints, el } of this.fieldRefs) {
      values[camelKey] = constraints.type === 'url' && el.value.trim() !== ''
        ? normalizeUrl(el.value)
        : el.value;
    }

    this.hide();
    const answer = this.pendingAnswer;
    this.pendingAnswer = null;
    this.onConfirm(values);
    answer?.(values);
  }

  private firstInvalidField(): HTMLInputElement | undefined {
    return this.fieldRefs
      .find(ref => ref.el.classList.contains('input-dialog__input--invalid'))
      ?.el;
  }
}
