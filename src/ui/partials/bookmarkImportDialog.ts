import { t } from '../../i18n/i18n';
import { dismissOnBackdropClick } from './backdropDismiss';
import { BookmarkFolderChoice } from '../../viewModel/bookmarkImport';

/**
 * Asks which of the browser's bookmark folders to import (#182). Each ticked folder becomes a
 * group.
 *
 * Every folder starts ticked, because most people want all of them. They are listed under the
 * browser's root they are in ("Bookmarks bar", "Other bookmarks"), each with how many links
 * it brings. Whether the ticked set fits the workspace is asked on every change (`problem`).
 * While it does not, the reason is shown and Import stays disabled, so nothing is ever half
 * imported.
 *
 * Resolves to the ticked identifiers, or null when cancelled or dismissed.
 */
export class BookmarkImportDialog {

  private dialogEl: HTMLDialogElement | null = null;

  /**
   * @param choices the folders to offer, in the browser's order
   * @param problem why these would not fit, worded for the user, or null when they would
   */
  constructor(
    private readonly choices: ReadonlyArray<BookmarkFolderChoice>,
    private readonly problem: (chosen: ReadonlySet<string>) => string | null
  ) {}

  public ask(): Promise<Set<string> | null> {
    return new Promise<Set<string> | null>(resolve => {
      let answered = false;
      const settle = (value: Set<string> | null): void => {
        if (answered) return;
        answered = true;
        this.dialogEl?.close();
        this.dialogEl?.remove();
        this.dialogEl = null;
        resolve(value);
      };
      this.dialogEl = this.build(settle);
      document.body.appendChild(this.dialogEl);
      this.dialogEl.addEventListener('close', () => settle(null));
      this.dialogEl.showModal();
    });
  }

  private build(settle: (value: Set<string> | null) => void): HTMLDialogElement {
    const dialog = document.createElement('dialog');
    dialog.classList.add('input-dialog', 'choice-dialog', 'bookmark-import-dialog');

    const heading = document.createElement('h2');
    heading.classList.add('input-dialog__title');
    heading.textContent = t('workspace.bookmarkImport.title');

    const message = document.createElement('p');
    message.classList.add('choice-dialog__message');
    message.textContent = t('workspace.bookmarkImport.message');

    const list = document.createElement('div');
    list.classList.add('bookmark-import-dialog__list');
    const boxes = new Map<string, HTMLInputElement>();
    let lastRoot: string | null = null;
    this.choices.forEach((choice, index) => {
      if (choice.rootTitle !== lastRoot) {
        lastRoot = choice.rootTitle;
        const rootHeading = document.createElement('h3');
        rootHeading.classList.add('bookmark-import-dialog__root');
        rootHeading.textContent = choice.rootTitle;
        list.appendChild(rootHeading);
      }
      const row = document.createElement('div');
      row.classList.add('input-dialog__field', 'input-dialog__field--checkbox');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = true;
      box.id = `bookmark-import-${index}`;
      box.classList.add('input-dialog__checkbox');
      const label = document.createElement('label');
      label.classList.add('input-dialog__label');
      label.htmlFor = box.id;
      label.textContent = t('workspace.bookmarkImport.folder', {
        name: choice.loose ? t('workspace.bookmarkImport.loose') : choice.title,
        count: choice.linkCount
      });
      row.append(box, label);
      list.appendChild(row);
      boxes.set(choice.id, box);
    });

    const problemEl = document.createElement('p');
    problemEl.classList.add('input-dialog__form-error', 'bookmark-import-dialog__problem');

    const actions = document.createElement('div');
    actions.classList.add('input-dialog__actions', 'choice-dialog__actions');
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = t('common.cancel');
    cancelBtn.classList.add('danger');
    cancelBtn.addEventListener('click', () => settle(null));
    const importBtn = document.createElement('button');
    importBtn.type = 'button';
    importBtn.textContent = t('workspace.bookmarkImport.confirm');
    importBtn.classList.add('add');
    actions.append(cancelBtn, importBtn);

    const chosen = (): Set<string> =>
      new Set([...boxes].filter(([, box]) => box.checked).map(([id]) => id));
    const refresh = (): void => {
      const ticked = chosen();
      const problem = ticked.size === 0 ? null : this.problem(ticked);
      problemEl.textContent = problem ?? '';
      problemEl.hidden = problem === null;
      importBtn.disabled = ticked.size === 0 || problem !== null;
    };
    list.addEventListener('change', refresh);
    importBtn.addEventListener('click', () => {
      if (!importBtn.disabled) settle(chosen());
    });
    refresh();

    dialog.append(heading, message, list, problemEl, actions);
    dismissOnBackdropClick(dialog, () => settle(null));
    return dialog;
  }
}
