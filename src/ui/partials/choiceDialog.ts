
/** One button in a choice dialog: what it says, and what picking it means. */
export interface Choice<VALUE> {
  label: string;
  value: VALUE;

  /** Renders the button as destructive, the way the rest of this UI marks such actions. */
  danger?: boolean;
}

/**
 * Asks a question with more than two answers.
 *
 * InputDialog cannot do this: it is a form, so it has exactly the two answers a form has, and
 * `confirm()` has the same problem. The device name clash needs three - keep the name and take
 * the other device over, choose a different name, or stop - and collapsing any two of them
 * loses something the user would want.
 *
 * Resolves to the chosen value, or null when the dialog is dismissed. Dismissal is a real
 * answer here rather than an absence of one: closing a dialog that asks "what should I do about
 * this" means "nothing", which is why it is offered as its own value rather than left to a
 * timeout or a default.
 */
export class ChoiceDialog<VALUE> {

  private readonly title: string;
  private readonly message: string;
  private readonly choices: ReadonlyArray<Choice<VALUE>>;

  private dialogEl: HTMLDialogElement | null = null;

  /**
   * @param title    heading, naming the situation rather than the question
   * @param message  the question itself, in full sentences
   * @param choices  the answers, in the order they should be offered
   */
  constructor(title: string, message: string, choices: ReadonlyArray<Choice<VALUE>>) {
    this.title = title;
    this.message = message;
    this.choices = choices;
  }

  /**
   * Shows the dialog and waits for an answer.
   *
   * @return the chosen value, or null when the user dismissed the dialog
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
      // Escape closes a <dialog> natively, and that is a dismissal like any other.
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

  private build(settle: (value: VALUE | null) => void): HTMLDialogElement {
    const dialog = document.createElement('dialog');
    dialog.classList.add('input-dialog', 'choice-dialog');

    const heading = document.createElement('h2');
    heading.classList.add('input-dialog__title');
    heading.textContent = this.title;
    dialog.appendChild(heading);

    const message = document.createElement('p');
    message.classList.add('choice-dialog__message');
    message.textContent = this.message;
    dialog.appendChild(message);

    const actions = document.createElement('div');
    actions.classList.add('input-dialog__actions', 'choice-dialog__actions');

    this.choices.forEach(choice => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = choice.label;
      if (choice.danger) button.classList.add('danger');
      button.addEventListener('click', () => settle(choice.value));
      actions.appendChild(button);
    });

    dialog.appendChild(actions);
    return dialog;
  }
}
