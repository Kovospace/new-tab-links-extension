import { BookmarkRequest } from '../../utils/bookmarkRequest';
import {
  BookmarkDestination, BookmarkPlace, BookmarkTargetDTO, BookmarkViewModel
} from '../../viewModel/bookmarkViewModel';
import { FaviconsHandler } from '../backgroundWorkerCommands/faviconsHandler';
import { t } from '../../i18n/i18n';
import { describeFairUseRefusal } from '../../viewModel/fairUseNoticeViewModel';
import { validateField } from './fieldValidation';
import { MAX_DESCRIPTION_LENGTH, MAX_NAME_LENGTH } from '../../backend/sync/SyncContracts';

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
 *
 * **Somewhere to put it is never missing.** The group dropdown ends with "New group…" and the
 * subgroup dropdown with "New subgroup…"; either opens a field for the name, and the group one
 * for a description too. A workspace with no group starts on "New group…", and a profile with
 * no workspace at all asks for the workspace's name as well - so the first group and workspace
 * are still the user's decision, only made where they are needed instead of somewhere else.
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

  /** The new workspace's name; only drawn when the profile has no workspace. */
  private newWorkspaceInput: HTMLInputElement | null = null;
  private newGroupInput!: HTMLInputElement;
  private newGroupDescriptionInput!: HTMLInputElement;
  private newSubgroupInput!: HTMLInputElement;
  private newGroupRows: HTMLElement[] = [];
  private newSubgroupRow!: HTMLElement;

  /** Why the last save was refused - a limit, or a name to make something under; hidden until one is. */
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
    this.newGroupInput = this.buildTextInput('bookmark-new-group', t('bookmark.newGroup.defaultName'));
    this.newGroupDescriptionInput = this.buildTextInput('bookmark-new-group-description', '');
    this.newGroupDescriptionInput.placeholder = t('bookmark.optional');
    this.newSubgroupInput = this.buildTextInput('bookmark-new-subgroup', '');

    this.appendRow(fields, t('bookmark.fields.name'), this.nameInput);
    this.appendRow(fields, t('bookmark.fields.url'), this.urlInput);
    this.appendRow(fields, t('bookmark.fields.workspace'), this.buildWorkspaceField());
    this.appendRow(fields, t('bookmark.fields.group'), this.groupSelect);
    this.newGroupRows = [
      this.appendRow(fields, t('bookmark.fields.newGroup'), this.newGroupInput),
      this.appendRow(fields, t('bookmark.fields.description'), this.newGroupDescriptionInput)
    ];
    this.subgroupField =
      this.appendRow(fields, t('bookmark.fields.subgroup'), this.subgroupSelect);
    this.newSubgroupRow =
      this.appendRow(fields, t('bookmark.fields.newSubgroup'), this.newSubgroupInput);

    this.groupSelect.addEventListener('change', () => this.renderSubgroups());
    this.subgroupSelect.addEventListener('change', () => this.renderNewSubgroup());

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
    if (this.workspaces.length === 0) {
      // Nothing to choose and nothing to name: the profile's first workspace is made here, and
      // what it is called is asked rather than decided.
      this.workspaceSelect = null;
      this.newWorkspaceInput =
        this.buildTextInput('bookmark-new-workspace', t('bookmark.newWorkspace.defaultName'));
      return this.newWorkspaceInput;
    }
    if (this.workspaces.length === 1) {
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
   * the subgroups after it. "New group…" is always the last entry - and in a workspace without
   * groups the only one, so the form opens on the field that names it.
   */
  private renderGroups(): void {
    this.groups = this.viewModel.getGroups(this.chosenWorkspaceId());
    fillOptions(this.groupSelect,
      [...this.groups.map(group => group.title), t('bookmark.newGroup.option')]);
    this.renderSubgroups();
  }

  /** The group now chosen; undefined when it is the one "New group…" is about to make. */
  private chosenGroup(): BookmarkTargetDTO | undefined {
    return this.groups[Number(this.groupSelect.value)];
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
   * Fills the subgroup dropdown for the group now chosen: "none", its subgroups, and "New
   * subgroup…". A group still to be made has no subgroups to offer and asks for its own name
   * and description instead, so the dropdown gives way to those.
   */
  private renderSubgroups(): void {

    const group = this.chosenGroup();
    this.subgroups = group ? this.viewModel.getSubgroups(group.id) : [];

    this.newGroupRows.forEach(row => { row.hidden = group !== undefined; });
    this.subgroupField.hidden = group === undefined;
    fillOptions(this.subgroupSelect, [
      noSubgroupLabel(),
      ...this.subgroups.map(one => one.title),
      t('bookmark.newSubgroup.option')
    ]);
    this.renderNewSubgroup();
  }

  /** Shows the new subgroup's name only while "New subgroup…" is what is chosen. */
  private renderNewSubgroup(): void {
    this.newSubgroupRow.hidden =
      this.subgroupField.hidden || !this.isNewSubgroupChosen();
  }

  /** "New subgroup…" is the entry after "none" and every subgroup. */
  private isNewSubgroupChosen(): boolean {
    return Number(this.subgroupSelect.value) === this.subgroups.length + 1;
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

    const destination = this.destination();
    if (!destination) {
      return;
    }

    const refusal = await this.viewModel.saveInto(
      url,
      this.nameInput.value.trim() || url,
      destination);

    if (refusal) {
      // The form stays open: another workspace may still have room.
      this.say(describeFairUseRefusal(refusal));
      return;
    }

    settle(true);
  }

  /**
   * Where the link goes, as chosen - including anything the form was asked to make on the way.
   *
   * A name to make something under is held to the account's rules here, before anything is
   * made: one over-long name would otherwise stop every later change from synchronising.
   *
   * @return null when a name is missing or too long; the form then says so on that field
   */
  private destination(): BookmarkDestination | null {

    const workspace: BookmarkPlace | null = this.newWorkspaceInput
      ? this.placeToMake(this.newWorkspaceInput, t('bookmark.fields.workspace'))
      : this.idOf(this.chosenWorkspaceId());

    const group = this.chosenGroup();
    if (!group) {
      const newGroup = this.placeToMake(this.newGroupInput, t('bookmark.fields.newGroup'));
      const description = this.newGroupDescriptionInput.value.trim();
      const problem = validateField(t('bookmark.fields.description'), description,
        { type: 'string', maxLength: MAX_DESCRIPTION_LENGTH });
      if (problem) {
        this.say(problem, this.newGroupDescriptionInput);
        return null;
      }
      return workspace && newGroup
        ? { workspace, group: { ...newGroup, description: description || undefined } }
        : null;
    }

    // Index 0 of the subgroup dropdown is "none"; the subgroups start behind it.
    const subgroup: BookmarkPlace | null | undefined = this.isNewSubgroupChosen()
      ? this.placeToMake(this.newSubgroupInput, t('bookmark.fields.newSubgroup'))
      : this.idOf(this.subgroups[Number(this.subgroupSelect.value) - 1]?.id) ?? undefined;

    return workspace && subgroup !== null
      ? { workspace, group: { id: group.id }, subgroup }
      : null;
  }

  /** A place that exists already, or null when there is no identifier to name it by. */
  private idOf(id: string | null | undefined): BookmarkPlace | null {
    return id ? { id } : null;
  }

  /**
   * Something to make under the name typed into `input`; null, said on that field, when the
   * name is one the account would not store.
   */
  private placeToMake(input: HTMLInputElement, label: string): BookmarkPlace | null {
    const name = input.value.trim();
    const problem = validateField(label, name,
      { type: 'string', required: true, maxLength: MAX_NAME_LENGTH });
    if (problem) {
      this.say(problem, input);
      return null;
    }
    return { create: name };
  }

  /** Says why the form did not save, in the line above its buttons, and points at the cause. */
  private say(message: string, field?: HTMLInputElement): void {
    this.refusalMessage.textContent = message;
    this.refusalMessage.hidden = false;
    field?.focus();
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
 * Says that there is nothing to bookmark, and waits for that to be read.
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
