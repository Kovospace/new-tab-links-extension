import { t } from '../../i18n/i18n';
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

/**
 * What a field's value is handed to the callback under.
 *
 * The label, camel-cased, unless the field says otherwise - and every field in this extension
 * now says otherwise, because a label is translated and a callback's parameter name is not.
 * The camel-cased fallback is kept for a caller with nothing to translate, which is what the
 * tests are.
 */
function keyOf(label: string, constraints: FieldConstraints): string {
  return constraints.key ?? toCamelCase(label);
}

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
  if (type === 'checkbox') {
    input.type = 'checkbox';
    input.classList.add('input-dialog__checkbox');
    return input;
  }
  input.placeholder = placeholder;
  input.classList.add('editable', 'input-dialog__input');
  input.type = type === 'password' ? 'password' : 'text';
  return input;
}

/**
 * What one field answers: "true" or "false" for a checkbox, which a string-valued callback can
 * still compare; nothing for a field a checkbox has switched off.
 */
function valueOf(ref: FieldRef): string {
  if (ref.constraints.type === 'checkbox') return String(ref.el.checked);
  return ref.el.disabled ? '' : ref.el.value;
}

/** One field of the dialog, and everything about it the dialog has to keep hold of. */
interface FieldRef {
  camelKey: string;
  label: string;
  constraints: FieldConstraints;
  el: HTMLInputElement;
  errorEl: HTMLElement;
  /** Whether the user has typed into it, or it arrived prefilled; an untouched field is not told off. */
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
 * has not reached: the message appears once something has been typed into the field, or as
 * soon as somebody tries to confirm anyway. Merely leaving a field does not count - the dialog
 * focuses its first field itself, so that would complain about a field the user never chose.
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
      const camelKey = keyOf(label, constraints);

      const wrapper = document.createElement('div');
      wrapper.classList.add('input-dialog__field');
      if (constraints.type === 'checkbox') {
        wrapper.classList.add('input-dialog__field--checkbox');
      }

      const labelEl = document.createElement('label');
      labelEl.classList.add('input-dialog__label');
      labelEl.htmlFor = fieldId;
      labelEl.textContent = constraints.required ? t('dialogs.requiredField', { label }) : label;

      const input = buildInput(constraints.type, fieldId, label);
      if (constraints.type === 'checkbox') {
        input.checked = prefill?.[camelKey] !== undefined
          ? prefill[camelKey] === 'true'
          : constraints.checked === true;
      } else if (prefill?.[camelKey] !== undefined) {
        input.value = prefill[camelKey];
      }

      const errorEl = document.createElement('span');
      errorEl.classList.add('input-dialog__error');
      errorEl.hidden = true;

      // A checkbox comes before what it says, the way every form puts one.
      if (constraints.type === 'checkbox') {
        wrapper.appendChild(input);
        wrapper.appendChild(labelEl);
      } else {
        wrapper.appendChild(labelEl);
        wrapper.appendChild(input);
      }
      wrapper.appendChild(errorEl);
      form.appendChild(wrapper);

      const ref: FieldRef = {
        camelKey,
        label,
        constraints,
        el: input,
        errorEl,
        // A field arriving with a value was filled in by whoever opened the dialog - a rename
        // prefills the current name - so it has something to say about itself already.
        touched: (prefill?.[camelKey] ?? '') !== ''
      };
      this.fieldRefs.push(ref);

      // Typing is what touches a field - not focus leaving it. The dialog focuses its first
      // field as it opens, so leaving that field is the first thing anyone does: clicking on to
      // the second one printed "is required" under the first before a key had been pressed.
      input.addEventListener('input', () => {
        ref.touched = true;
        this.revalidate();
      });
      input.addEventListener('change', () => {
        this.applyEnables();
        this.revalidate();
      });
    });

    this.applyEnables();

    const actions = document.createElement('div');
    actions.classList.add('input-dialog__actions');

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = t('common.cancel');
    cancelBtn.classList.add("danger");
    cancelBtn.addEventListener('click', () => this.hide());

    this.confirmBtn = document.createElement('button');
    this.confirmBtn.type = 'button';
    this.confirmBtn.textContent = t('common.ok');
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
      values[ref.camelKey] = valueOf(ref);
    }
    return values;
  }

  /** Disables every field whose enabling checkbox is unticked, and enables the rest. */
  private applyEnables(): void {
    for (const toggle of this.fieldRefs) {
      if (toggle.constraints.type !== 'checkbox' || !toggle.constraints.enables) continue;
      const target = this.fieldRefs.find(ref => ref.camelKey === toggle.constraints.enables);
      if (target) {
        target.el.disabled = !toggle.el.checked;
        target.el.closest('.input-dialog__field')?.classList
          .toggle('input-dialog__field--disabled', target.el.disabled);
      }
    }
  }

  /** The fields that take part: a disabled one is neither checked nor answered. */
  private liveRefs(): FieldRef[] {
    return this.fieldRefs.filter(ref => !ref.el.disabled);
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
      Object.fromEntries(this.liveRefs().map(ref => [ref.camelKey, ref.constraints])),
      Object.fromEntries(this.liveRefs().map(ref => [ref.camelKey, ref.label])));

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
    for (const ref of this.fieldRefs) {
      const value = valueOf(ref);
      values[ref.camelKey] = ref.constraints.type === 'url' && value.trim() !== ''
        ? normalizeUrl(value)
        : value;
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
