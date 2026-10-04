import { BookmarkRequest } from '../../utils/bookmarkRequest';
import { BookmarkTargetDTO, BookmarkViewModel } from '../../viewModel/bookmarkViewModel';
import { FaviconsHandler } from '../backgroundWorkerCommands/faviconsHandler';
import { t } from '../../i18n/i18n';
import { describeFairUseRefusal } from '../../viewModel/fairUseNoticeViewModel';

/** Shown until the page's own icon arrives, and when none can be found. */
const ICON_DEFAULT = '/gfx/favicon-default.svg';

/** What the dropdown offers when the chosen group's own body is the destination. */
const noSubgroupLabel = (): string => t('bookmark.noSubgroup');

/**
 * The form that keeps the page the user is looking at.
 *
 * It is the whole of its page, not a dialog on one. The page is the extension's action popup -
 * the bubble the browser draws under the toolbar icon - and the browser sizes that bubble to
 * the document it contains. A modal <dialog> is out of flow, so a page holding only one would
 * measure as empty and the bubble would collapse to nothing. Rendering the form inline also
 * means there is nothing to dismiss: closing the popup is the browser's job, and Escape does
 * it without any of this being involved.
 *
 * The layout is three columns, as TODOS.md asks for: the page's icon on the left, the labels
 * in the middle against the fields, and the fields on the right. The workspace is a dropdown
 * only when the profile has more than one, starting on the open one; with one it is a label
 * without a field, because a question with one answer is not a question - see
 * BookmarkViewModel. Choosing another workspace refills the groups, and the groups refill the
 * subgroups.
 */
export class BookmarkForm {

  private readonly viewModel: BookmarkViewModel;
  private readonly request: BookmarkRequest;

  private nameInput!: HTMLInputElement;
  private urlInput!: HTMLInputElement;
  private workspaceSelect: HTMLSelectElement | null = null;
  private groupSelect!: HTMLSelectElement;
  private subgroupSelect!: HTMLSelectElement;
  private subgroupField!: HTMLElement;
  private saveBtn!: HTMLButtonElement;

  /** Why the last save was refused under a fair use limit; hidden until one is. */
  private readonly refusalMessage: HTMLElement = buildRefusalMessage();

  private workspaces: BookmarkTargetDTO[] = [];
  private groups: BookmarkTargetDTO[] = [];
  private subgroups: BookmarkTargetDTO[] = [];

  /**
   * @param request   the page to bookmark
   * @param viewModel supplies the destinations and stores the link; injectable for testing
   */
  constructor(request: BookmarkRequest, viewModel: BookmarkViewModel = new BookmarkViewModel()) {
    this.request = request;
    this.viewModel = viewModel;
  }

  /**
   * Draws the form and waits for it to be finished with.
   *
   * @param host where to draw it; emptied first
   * @return true when the bookmark was stored, false when the user backed out
   */
  public render(host: HTMLElement): Promise<boolean> {
    return new Promise<boolean>(resolve => {

      let answered = false;
      const settle = (saved: boolean): void => {
        if (answered) return;
        answered = true;
        resolve(saved);
      };

      this.workspaces = this.viewModel.getWorkspaces();

      host.replaceChildren(this.build(settle));

      // The name is what a user most often wants to shorten, so it is what is selected.
      this.nameInput.focus();
      this.nameInput.select();
    });
  }

  private build(settle: (saved: boolean) => void): HTMLElement {

    const panel = document.createElement('section');
    panel.classList.add('bookmark-panel');

    const heading = document.createElement('h2');
    heading.classList.add('input-dialog__title');
    heading.textContent = t('bookmark.heading');
    panel.appendChild(heading);

    const form = document.createElement('form');
    form.classList.add('bookmark-panel__form');

    // The icon is the left column; the labels and the fields are the two columns of the
    // grid beside it, which is also what keeps the labels aligned against their fields.
    const fields = document.createElement('div');
    fields.classList.add('bookmark-panel__fields');

    form.appendChild(this.buildIcon());
    form.appendChild(fields);

    this.nameInput = this.buildTextInput('bookmark-name', this.request.title);
    this.urlInput = this.buildTextInput('bookmark-url', this.request.url);
    this.groupSelect = this.buildSelect('bookmark-group');
    this.subgroupSelect = this.buildSelect('bookmark-subgroup');

    this.appendRow(fields, t('bookmark.fields.name'), this.nameInput);
    this.appendRow(fields, t('bookmark.fields.url'), this.urlInput);
    this.appendRow(fields, t('bookmark.fields.workspace'), this.buildWorkspaceField());
    this.appendRow(fields, t('bookmark.fields.group'), this.groupSelect);
    this.subgroupField =
      this.appendRow(fields, t('bookmark.fields.subgroup'), this.subgroupSelect);

    this.groupSelect.addEventListener('change', () => this.renderSubgroups());

    // The actions before the groups, because filling the groups is what decides whether
    // there is anything to save into.
    fields.appendChild(this.refusalMessage);
    fields.appendChild(this.buildActions(settle));
    this.renderGroups();
    panel.appendChild(form);

    // Enter anywhere in the form saves, the way it does in the input dialog. The form is
    // never submitted: there is nowhere to submit it to, and letting it try would reload
    // the popup.
    form.addEventListener('submit', event => {
      event.preventDefault();
      void this.save(settle);
    });

    return panel;
  }

  /** The page's own icon, in the column to the left of everything else. */
  private buildIcon(): HTMLElement {

    const cell = document.createElement('div');
    cell.classList.add('bookmark-panel__icon');

    const img = document.createElement('img');
    img.width = 32;
    img.height = 32;
    img.alt = '';
    img.src = this.request.favIconUrl ?? ICON_DEFAULT;
    // A tab's icon can be gone by the time this opens, and a page may declare one Chrome
    // never fetched. Either way the favicon worker knows how to find one.
    img.addEventListener('error', () => { img.src = ICON_DEFAULT; });
    if (!this.request.favIconUrl) {
      FaviconsHandler
        .handleIconDownloadAndCache(this.request.url)
        .then(iconSrc => { if (iconSrc) img.src = iconSrc; });
    }

    cell.appendChild(img);
    return cell;
  }

  /**
   * The workspace the link is going into: a dropdown starting on the open workspace when the
   * profile has several, and only stated when it has one.
   */
  private buildWorkspaceField(): HTMLElement {
    if (this.workspaces.length <= 1) {
      this.workspaceSelect = null;
      const value = document.createElement('span');
      value.classList.add('bookmark-panel__value');
      value.textContent = this.viewModel.getWorkspaceName() ?? '';
      return value;
    }

    const select = this.buildSelect('bookmark-workspace');
    fillOptions(select, this.workspaces.map(workspace => workspace.title));
    const current = this.workspaces.findIndex(
      workspace => workspace.id === this.viewModel.getCurrentWorkspaceId());
    select.value = String(Math.max(current, 0));
    select.addEventListener('change', () => this.renderGroups());

    this.workspaceSelect = select;
    return select;
  }

  /** The workspace now chosen, or the open one when there was nothing to choose between. */
  private chosenWorkspaceId(): string | null {
    if (!this.workspaceSelect) {
      return this.viewModel.getCurrentWorkspaceId();
    }
    return this.workspaces[Number(this.workspaceSelect.value)]?.id ?? null;
  }

  /**
   * Fills the group dropdown for the workspace now chosen, starting on its first group, and
   * the subgroups after it. A workspace without groups leaves nothing to save into, so the
   * save button is disabled rather than allowed to do nothing.
   */
  private renderGroups(): void {
    this.groups = this.viewModel.getGroups(this.chosenWorkspaceId());
    fillOptions(this.groupSelect, this.groups.map(group => group.title));
    this.saveBtn.disabled = this.groups.length === 0;
    this.renderSubgroups();
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
    row.classList.add('bookmark-panel__row');

    const labelEl = document.createElement('label');
    labelEl.classList.add('input-dialog__label', 'bookmark-panel__label');
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
    actions.classList.add('input-dialog__actions', 'bookmark-panel__actions');

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = t('common.cancel');
    cancelBtn.classList.add('danger');
    cancelBtn.addEventListener('click', () => settle(false));

    this.saveBtn = document.createElement('button');
    this.saveBtn.type = 'submit';
    this.saveBtn.textContent = t('common.save');
    this.saveBtn.classList.add('add');

    actions.appendChild(cancelBtn);
    actions.appendChild(this.saveBtn);
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
    fillOptions(this.subgroupSelect,
      [noSubgroupLabel(), ...this.subgroups.map(one => one.title)]);
  }

  /**
   * Stores the link.
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

    const refusal = await this.viewModel.save(
      url,
      this.nameInput.value.trim() || url,
      group.id,
      subgroup?.id);

    if (refusal) {
      // The form stays open: another workspace may still have room.
      this.refusalMessage.textContent = describeFairUseRefusal(refusal);
      this.refusalMessage.hidden = false;
      return;
    }

    settle(true);
  }
}

/** The line that says a save was refused, styled as the input dialog's field errors are. */
function buildRefusalMessage(): HTMLElement {
  const message = document.createElement('p');
  message.classList.add('input-dialog__error');
  message.setAttribute('role', 'alert');
  message.hidden = true;
  return message;
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

/**
 * Says that there is nowhere to put a bookmark, and waits for that to be read.
 *
 * A notice rather than a dialog, for the same reason the form is: this is the whole page.
 *
 * @param host    where to draw it
 * @param message what to say
 */
export function renderNotice(host: HTMLElement, title: string, message: string): Promise<void> {
  return new Promise<void>(resolve => {

    const panel = document.createElement('section');
    panel.classList.add('bookmark-panel');

    const heading = document.createElement('h2');
    heading.classList.add('input-dialog__title');
    heading.textContent = title;

    const text = document.createElement('p');
    text.classList.add('bookmark-panel__message');
    text.textContent = message;

    const actions = document.createElement('div');
    actions.classList.add('input-dialog__actions', 'bookmark-panel__actions');

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = 'Close';
    closeBtn.classList.add('add');
    closeBtn.addEventListener('click', () => resolve());
    actions.appendChild(closeBtn);

    panel.appendChild(heading);
    panel.appendChild(text);
    panel.appendChild(actions);

    host.replaceChildren(panel);
    closeBtn.focus();
  });
}
