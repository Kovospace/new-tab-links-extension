import { ManagedProfileDTO, ProfileManagerViewModel } from '../../viewModel/profileManagerViewModel';
import { confirmByTypingPhrase, confirmDestructiveAction, showNotice } from './confirmations';
import { InputDialog } from './inputDialog';
import { MAX_NAME_LENGTH } from '../../backend/sync/SyncContracts';
import { ICON, renderUnsyncedMark } from './wrappedHtmlElements';
import { t } from '../../i18n/i18n';
import { dismissOnBackdropClick } from './backdropDismiss';

/** What has to be typed before every other profile is deleted at once. */


/**
 * The profile manager: every profile the account has, and the ability to remove one or all.
 *
 * It is a <dialog> wearing the input dialog's frame rather than a screen of its own, because it
 * is opened from the profiles menu and answers one question - which of these do I want to keep,
 * and under what name. Creating a profile is still the menu's job; this screen only acts on the
 * profiles that already exist.
 *
 * **Why it exists.** The profiles menu could switch, export, import and create, and never
 * delete or rename, so a profile - including one the extension itself created by accident -
 * could not be got rid of, or corrected, from inside the extension at all.
 *
 * Renaming is offered on every row, deletion on every row but the active one. That asymmetry is
 * the point: a rename cannot lose anything, so it needs no ceremony and no switching first.
 */
export class ProfileManagerDialog {

  private readonly viewModel: ProfileManagerViewModel;

  private dialogEl: HTMLDialogElement | null = null;
  private listEl: HTMLElement | null = null;
  private unsubscribe: (() => void) | null = null;

  /**
   * @param viewModel supplies the rows and performs the deletions; injectable for testing
   */
  constructor(viewModel: ProfileManagerViewModel = new ProfileManagerViewModel()) {
    this.viewModel = viewModel;
  }

  /** Builds the dialog, loads the profiles into it, and shows it. */
  public async show(): Promise<void> {
    this.dialogEl = this.build();
    document.body.appendChild(this.dialogEl);

    this.unsubscribe = this.viewModel.observables.profiles
      .subscribe(profiles => this.renderRows(profiles));

    this.dialogEl.addEventListener('close', () => this.dispose());
    this.dialogEl.showModal();

    await this.viewModel.refresh();
  }

  private hide(): void {
    this.dialogEl?.close();
  }

  /** Detaches the subscription and the element; the dialog is rebuilt on the next open. */
  private dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.dialogEl?.remove();
    this.dialogEl = null;
    this.listEl = null;
  }

  private build(): HTMLDialogElement {
    const dialog = document.createElement('dialog');
    dialog.classList.add('input-dialog', 'profile-manager');

    const heading = document.createElement('h2');
    heading.classList.add('input-dialog__title');
    heading.textContent = t('profiles.manager.title');
    dialog.appendChild(heading);

    this.listEl = document.createElement('div');
    this.listEl.classList.add('profile-manager__list');
    dialog.appendChild(this.listEl);

    const actions = document.createElement('div');
    actions.classList.add('input-dialog__actions', 'profile-manager__actions');

    const deleteAllBtn = document.createElement('button');
    deleteAllBtn.type = 'button';
    // Named for what it does. "Delete all" would be a lie: the profile being displayed stays,
    // because there is no such thing as no profiles.
    deleteAllBtn.textContent = t('profiles.manager.deleteAllOthers');
    deleteAllBtn.classList.add('danger');
    deleteAllBtn.addEventListener('click', () => void this.deleteEveryOther());

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', () => this.hide());

    actions.appendChild(deleteAllBtn);
    actions.appendChild(closeBtn);
    dialog.appendChild(actions);

    // Clicking the backdrop closes it, matching every other dialog here.
    dismissOnBackdropClick(dialog, () => this.hide());

    return dialog;
  }

  /** Redraws the list from the view model; called on every change to it. */
  private renderRows(profiles: ManagedProfileDTO[]): void {
    if (!this.listEl) return;
    this.listEl.replaceChildren();

    if (profiles.length === 0) {
      this.listEl.appendChild(this.note(t('profiles.manager.empty')));
      return;
    }

    profiles.forEach(profile => this.listEl!.appendChild(this.buildRow(profile)));

    if (profiles.length === 1) {
      this.listEl.appendChild(this.note(
        t('profiles.manager.onlyOne')));
    }
  }

  private buildRow(profile: ManagedProfileDTO): HTMLElement {
    const row = document.createElement('div');
    row.classList.add('profile-manager__row');
    if (profile.active) row.classList.add('profile-manager__row--active');

    const text = document.createElement('div');
    text.classList.add('profile-manager__text');

    const name = document.createElement('span');
    name.classList.add('profile-manager__name');
    name.textContent = profile.active
      ? t('profiles.manager.current', { name: profile.name })
      : profile.name;

    const contents = document.createElement('span');
    contents.classList.add('profile-manager__contents');
    if (profile.empty) contents.classList.add('profile-manager__contents--empty');
    contents.textContent = profile.contentsLabel;

    if (profile.notSyncedReason) {
      // The crossed-out sync mark, as in the profiles menu, with why in its tooltip.
      name.appendChild(renderUnsyncedMark(profile.notSyncedReason));
    }

    text.appendChild(name);
    text.appendChild(contents);

    const renameBtn = document.createElement('button');
    renameBtn.type = 'button';
    renameBtn.classList.add('profile-manager__action');
    renameBtn.textContent = ICON.EDIT;
    renameBtn.title = t('profiles.manager.rename', { name: profile.name });
    renameBtn.addEventListener('click', () => void this.renameOne(profile));

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.classList.add('danger', 'profile-manager__action');
    deleteBtn.textContent = ICON.DELETE;

    if (profile.active) {
      // The profile on screen cannot be deleted from under itself. Saying why beats a button
      // that silently does nothing.
      deleteBtn.disabled = true;
      deleteBtn.title = t('profiles.manager.cannotDeleteActive');
    } else {
      deleteBtn.title = t('profiles.manager.delete', { name: profile.name });
      deleteBtn.addEventListener('click', () => void this.deleteOne(profile));
    }

    const actions = document.createElement('div');
    actions.classList.add('profile-manager__row-actions');
    actions.appendChild(renameBtn);
    actions.appendChild(deleteBtn);

    row.appendChild(text);
    row.appendChild(actions);
    return row;
  }

  /**
   * Asks for a new name for one profile and applies it.
   *
   * The field is prefilled with the name it has, because a rename is nearly always an edit of
   * the existing name rather than a fresh one. Cancelling, an unchanged name and an empty one
   * all end the same way - nothing happens - so there is nothing here to confirm.
   *
   * A name too long for the account is the one refusal worth saying out loud. The view model
   * would drop it silently, and a user whose rename appeared to do nothing would simply try
   * again; the length is not something they can see.
   */
  private async renameOne(profile: ManagedProfileDTO): Promise<void> {
    const answer = await new InputDialog(
      t('profiles.renameDialog.title'),
      {
        [t('profiles.renameDialog.name')]:
          { type: 'string', required: true, maxLength: MAX_NAME_LENGTH, key: 'profileName' }
      },
      () => { /* the answer is taken from ask(), below */ })
      .ask({ profileName: profile.name });

    const name = answer?.profileName?.trim();
    if (!name || name === profile.name) return;

    if (name.length > MAX_NAME_LENGTH) {
      await showNotice(
        t('profiles.nameTooLong.title'),
        t('profiles.nameTooLong.message', { max: MAX_NAME_LENGTH, length: name.length }));
      return;
    }

    await this.viewModel.renameProfile(profile.id, name);
  }

  private note(text: string): HTMLElement {
    const note = document.createElement('p');
    note.classList.add('profile-manager__note');
    note.textContent = text;
    return note;
  }

  /** Confirms and deletes one profile. */
  private async deleteOne(profile: ManagedProfileDTO): Promise<void> {
    const confirmed = await confirmDestructiveAction(
      t('profiles.deleteOne.title'),
      t('profiles.deleteOne.message',
        { name: profile.name, contents: profile.contentsLabel }),
      t('profiles.deleteOne.confirm'));

    if (confirmed) {
      await this.viewModel.deleteProfile(profile.id);
    }
  }

  /** Confirms, twice and the second time in writing, then deletes every other profile. */
  private async deleteEveryOther(): Promise<void> {
    const deletable = this.viewModel.countDeletable();

    if (deletable === 0) {
      await showNotice(
        t('profiles.nothingToDelete.title'),
        t('profiles.nothingToDelete.message'));
      return;
    }

    const confirmed = await confirmByTypingPhrase(
      t('profiles.deleteAll.title'),
      t('profiles.deleteAll.message', { count: deletable }),
      t('profiles.deleteAll.phrase'),
      t('profiles.deleteAll.confirm'));

    if (confirmed) {
      await this.viewModel.deleteEveryOtherProfile();
    }
  }
}
