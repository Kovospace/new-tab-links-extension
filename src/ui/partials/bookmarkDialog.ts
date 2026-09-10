import { BookmarkRequest } from '../../utils/bookmarkRequest';
import { BookmarkTargetDTO, BookmarkViewModel } from '../../viewModel/bookmarkViewModel';
import { FaviconsHandler } from '../backgroundWorkerCommands/faviconsHandler';
import { toggleOverlay } from './wrappedHtmlElements';

/** Shown until the page's own icon arrives, and when none can be found. */
const ICON_DEFAULT = '/gfx/favicon-default.svg';

/** What the dropdown offers when the chosen group's own body is the destination. */
const NO_SUBGROUP = '(none)';

/**
 * The form that keeps the page the user is looking at.
 *
 * It is a <dialog> wearing the input dialog's frame, like the profile manager, but it is the
 * only thing on its page: the shortcut is pressed on some other site, so this window exists
 * solely to ask this question and closes when it has an answer. That is why it resolves a
 * promise rather than calling back - the page has nothing else to do afterwards but close.
 *
 * The layout is three columns, as TODOS.md asks for: the page's icon on the left, the labels
 * in the middle against the fields, and the fields on the right. The workspace is a label
 * without a field because it is not a choice here - see BookmarkViewModel.
 */
export class BookmarkDialog {

  private readonly viewModel: BookmarkViewModel;
  private readonly request: BookmarkRequest;

  private dialogEl: HTMLDialogElement | null = null;
  private nameInput!: HTMLInputElement;
  private urlInput!: HTMLInputElement;
  private groupSelect!: HTMLSelectElement;
  private subgroupSelect!: HTMLSelectElement;
  private subgroupField!: HTMLElement;

  private groups: BookmarkTargetDTO[] = [];
  private subgroups: BookmarkTargetDTO[] = [];

  /**
   * @param request   the page to bookmark, as the service worker handed it over
   * @param viewModel supplies the destinations and stores the link; injectable for testing
   */
  constructor(request: BookmarkRequest, viewModel: BookmarkViewModel = new BookmarkViewModel()) {
    this.request = request;
    this.viewModel = viewModel;
  }

  /**
   * Shows the form and waits for it to be finished with.
   *
   * @return true when the bookmark was stored, false when the user backed out
   */
  public show(): Promise<boolean> {
    return new Promise<boolean>(resolve => {
      let answered = false;
      // Every way out goes through here - the buttons, Escape, the backdrop - so the dialog
      // is taken down exactly once however it was finished with.
      const settle = (saved: boolean): void => {
        if (answered) return;
        answered = true;
        this.hide();
        resolve(saved);
      };

      this.groups = this.viewModel.getGroups();
      this.dialogEl = this.build(settle);
      document.body.appendChild(this.dialogEl);
      // Cancel, Escape and the backdrop all end in the element's own close event.
      this.dialogEl.addEventListener('close', () => settle(false));
      this.dialogEl.showModal();
      toggleOverlay(true);

      // The name is what a user most often wants to shorten, so it is what is selected.
      this.nameInput.focus();
      this.nameInput.select();
    });
  }

  private hide(): void {
    toggleOverlay(false);
    // Closed before it is removed: a modal <dialog> lives in the browser's top layer, and
    // taking the element out from under that leaves the layer holding a node nothing points at.
    this.dialogEl?.close();
    this.dialogEl?.remove();
    this.dialogEl = null;
  }

  private build(settle: (saved: boolean) => void): HTMLDialogElement {

    const dialog = document.createElement('dialog');
    dialog.classList.add('input-dialog', 'bookmark-dialog');

    const heading = document.createElement('h2');
    heading.classList.add('input-dialog__title');
    heading.textContent = 'Bookmark this page';
    dialog.appendChild(heading);

    const form = document.createElement('form');
    form.method = 'dialog';
    form.classList.add('input-dialog__form', 'bookmark-dialog__form');

    // The icon is the left column; the labels and the fields are the two columns of the
    // grid beside it, which is also what keeps the labels aligned against their fields.
    const fields = document.createElement('div');
    fields.classList.add('bookmark-dialog__fields');

    form.appendChild(this.buildIcon());
    form.appendChild(fields);

    this.nameInput = this.buildTextInput('bookmark-name', this.request.title);
    this.urlInput = this.buildTextInput('bookmark-url', this.request.url);
    this.groupSelect = this.buildSelect('bookmark-group');
    this.subgroupSelect = this.buildSelect('bookmark-subgroup');

    this.appendRow(fields, 'Name', this.nameInput);
    this.appendRow(fields, 'URL', this.urlInput);
    this.appendRow(fields, 'Workspace', this.buildWorkspaceLabel());
    this.appendRow(fields, 'Group', this.groupSelect);
    this.subgroupField = this.appendRow(fields, 'Subgroup', this.subgroupSelect);

    fillOptions(this.groupSelect, this.groups.map(group => group.title));
    this.groupSelect.addEventListener('change', () => this.renderSubgroups());
    this.renderSubgroups();

    fields.appendChild(this.buildActions(settle));
    dialog.appendChild(form);

    // Enter anywhere in the form saves, the way it does in the input dialog.
    form.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        void this.save(settle);
      }
    });

    // click on the backdrop (outside the dialog box) dismisses it
    dialog.addEventListener('click', (event: MouseEvent) => {
      if (event.target === dialog) settle(false);
    });

    return dialog;
  }

  /** The page's own icon, in the column to the left of everything else. */
  private buildIcon(): HTMLElement {

    const cell = document.createElement('div');
    cell.classList.add('bookmark-dialog__icon');

    const img = document.createElement('img');
    img.width = 32;
    img.height = 32;
    img.alt = '';
    img.src = this.request.favIconUrl ?? ICON_DEFAULT;
    // A tab's icon can be gone by the time this window opens, and a page may declare one
    // Chrome never fetched. Either way the favicon worker knows how to find one.
    img.addEventListener('error', () => { img.src = ICON_DEFAULT; });
    if (!this.request.favIconUrl) {
      FaviconsHandler
        .handleIconDownloadAndCache(this.request.url)
        .then(iconSrc => { if (iconSrc) img.src = iconSrc; });
    }

    cell.appendChild(img);
    return cell;
  }

  /** The workspace the link is going into: stated, not chosen. */
  private buildWorkspaceLabel(): HTMLElement {
    const value = document.createElement('span');
    value.classList.add('bookmark-dialog__value');
    value.textContent = this.viewModel.getWorkspaceName() ?? '';
    return value;
  }

  private buildTextInput(id: string, value: string): HTMLInputElement {
    const input = document.createElement('input');
    input.id = id;
    input.type = 'text';
    input.value = value;
    input.classList.add('editable', 'input-dialog__input');
    return input;
  }

  private buildSelect(id: string): HTMLSelectElement {
    const select = document.createElement('select');
    select.id = id;
    select.classList.add('editable', 'input-dialog__input', 'input-dialog__select');
    return select;
  }

  /**
   * Adds one labelled row: the label in the middle column, the field on the right.
   *
   * @param fields the grid holding the rows
   * @param label  what the field is asking for
   * @param field  the control, or a plain value when the row only states something
   * @return the row, so that a caller can hide it again
   */
  private appendRow(fields: HTMLElement, label: string, field: HTMLElement): HTMLElement {

    // The row is display: contents, so the label and the field land in the two columns of
    // the grid rather than in a box of their own - and hiding the row still hides both.
    const row = document.createElement('div');
    row.classList.add('bookmark-dialog__row');

    const labelEl = document.createElement('label');
    labelEl.classList.add('input-dialog__label', 'bookmark-dialog__label');
    labelEl.textContent = label;
    if (field.id) {
      labelEl.htmlFor = field.id;
    }

    row.appendChild(labelEl);
    row.appendChild(field);
    fields.appendChild(row);
    return row;
  }

  private buildActions(settle: (saved: boolean) => void): HTMLElement {

    const actions = document.createElement('div');
    actions.classList.add('input-dialog__actions', 'bookmark-dialog__actions');

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.classList.add('danger');
    cancelBtn.addEventListener('click', () => settle(false));

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.textContent = 'Save';
    saveBtn.classList.add('add');
    saveBtn.addEventListener('click', () => void this.save(settle));

    actions.appendChild(cancelBtn);
    actions.appendChild(saveBtn);
    return actions;
  }

  /**
   * Fills the subgroup dropdown for the group now chosen, and hides it when that group has
   * no subgroups - a dropdown whose only entry is "none" is a question with one answer.
   */
  private renderSubgroups(): void {

    const group = this.groups[Number(this.groupSelect.value)];
    this.subgroups = group ? this.viewModel.getSubgroups(group.id) : [];

    this.subgroupField.hidden = this.subgroups.length === 0;
    fillOptions(this.subgroupSelect, [NO_SUBGROUP, ...this.subgroups.map(one => one.title)]);
  }

  /**
   * Stores the link and closes the window.
   *
   * A bookmark with no address is nothing at all, so an empty URL keeps the form open on the
   * offending field rather than storing a link that leads nowhere. An empty name is allowed
   * to stand as the address, which is what a page with no title gives us anyway.
   */
  private async save(settle: (saved: boolean) => void): Promise<void> {

    const typed = this.urlInput.value.trim();
    if (!typed) {
      this.urlInput.focus();
      return;
    }

    // A hand-edited address may have lost its scheme; the input dialog assumes the same one.
    const url = typed.includes('://') ? typed : `https://${typed}`;

    const group = this.groups[Number(this.groupSelect.value)];
    if (!group) {
      return;
    }

    // Index 0 of the subgroup dropdown is "none"; the subgroups start behind it.
    const subgroup = this.subgroups[Number(this.subgroupSelect.value) - 1];

    await this.viewModel.save(
      url,
      this.nameInput.value.trim() || url,
      group.id,
      subgroup?.id);

    settle(true);
  }
}

/** Replaces a dropdown's entries; each option carries the index of what it stands for. */
function fillOptions(select: HTMLSelectElement, labels: string[]): void {
  select.replaceChildren();
  labels.forEach((label, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = label;
    select.appendChild(option);
  });
}
