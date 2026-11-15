import { t } from '../../i18n/i18n';
import { ChoiceDialog } from './choiceDialog';
import { InputDialog } from './inputDialog';
import { BookmarkImportDialog } from './bookmarkImportDialog';
import { showNotice } from './confirmations';
import { MAX_DESCRIPTION_LENGTH, MAX_NAME_LENGTH } from '../../backend/sync/SyncContracts';
import { readBookmarkTree, requestBookmarksAccess } from '../../utils/browserBookmarks';
import { WelcomeAction, WorkspaceWelcomeViewModel } from '../../viewModel/workspaceWelcomeViewModel';

/**
 * What the workspace page lends the welcome: its own dialogs, so a group is added and a
 * sign-in made exactly as from the page's buttons and menus.
 */
export interface WelcomeDoors {
  /** Opens the add group dialog. Resolves to whether a group was made. */
  addGroup(workspaceId: string): Promise<boolean>;
  /** Opens a sign-in dialog. Resolves to whether this browser is now signed in. */
  signIn(how: 'logIn' | 'syncCode'): Promise<boolean>;
  rename(workspaceId: string, name: string, description: string): void;
  isSignedIn(): boolean;
}

/** Which wording each action's button carries. */
const ACTION_LABELS: Readonly<Record<WelcomeAction, () => string>> = {
  addGroup: () => t('workspace.welcome.addGroup'),
  importBookmarks: () => t('workspace.welcome.importBookmarks'),
  rename: () => t('workspace.welcome.rename'),
  loadExamples: () => t('workspace.welcome.loadExamples'),
  logIn: () => t('sync.menu.logIn'),
  syncCode: () => t('sync.menu.enterSyncCode'),
  cancel: () => t('common.cancel')
};

/**
 * The dialog an empty workspace opens with, once per workspace on each browser (#182). What it
 * offers is the view model's. This is how each answer is carried out.
 *
 * An answer that ends in a dialog of its own, cancelled, comes back here. Only Cancel, or
 * something actually done, ends the welcome. Renaming does not end it either, because the
 * workspace is still empty afterwards. The welcome comes back without the rename.
 */
export class WorkspaceWelcome {

  /** A welcome is on screen, so a redraw meanwhile does not open a second. */
  private open = false;

  constructor(
    private readonly viewModel: WorkspaceWelcomeViewModel,
    private readonly doors: WelcomeDoors
  ) {}

  /** Opens the welcome for this workspace if it is due: empty, and never offered here before. */
  public async offerIfDue(workspaceId: string): Promise<void> {
    if (this.open || !this.viewModel.isDue(workspaceId)) return;
    this.open = true;
    try {
      await this.viewModel.markOffered(workspaceId);
      await this.run(workspaceId);
    } finally {
      this.open = false;
    }
  }

  private async run(workspaceId: string): Promise<void> {
    let renamed = false;
    for (;;) {
      const welcome = this.viewModel.welcomeFor(
        workspaceId, { signedIn: this.doors.isSignedIn(), renamed });
      const action = await new ChoiceDialog<WelcomeAction>(
        welcome.title,
        welcome.message,
        welcome.actions.map(value => ({ value, label: ACTION_LABELS[value](), danger: value === 'cancel' })),
        'list'
      ).ask();

      switch (action) {
        case 'addGroup':
          if (await this.doors.addGroup(workspaceId)) return;
          break;
        case 'importBookmarks':
          // Straight on, with nothing awaited first: the permission prompt needs the click.
          if (await this.importBookmarks(workspaceId)) return;
          break;
        case 'rename':
          renamed = await this.rename(workspaceId) || renamed;
          break;
        case 'loadExamples':
          await this.viewModel.loadExamples();
          // The examples replace the whole profile, so the page is drawn again from them.
          window.location.reload();
          return;
        case 'logIn':
        case 'syncCode':
          if (await this.doors.signIn(action)) return;
          break;
        default:
          return;   // Cancel, Escape, or a click beside it.
      }
    }
  }

  /** Asks for a new name. Resolves to whether one was given. */
  private async rename(workspaceId: string): Promise<boolean> {
    const current = this.viewModel.workspaceText(workspaceId);
    const values = await new InputDialog(
      t('workspace.welcome.rename'),
      {
        [t('workspace.addDialog.name')]:
          { type: 'string', required: true, maxLength: MAX_NAME_LENGTH, key: 'workspaceName' },
        [t('workspace.addDialog.description')]:
          { type: 'string', maxLength: MAX_DESCRIPTION_LENGTH, key: 'workspaceDescription' }
      },
      ({ workspaceName, workspaceDescription }) =>
        this.doors.rename(workspaceId, workspaceName ?? '', workspaceDescription ?? '')
    ).ask({ workspaceName: current.name, workspaceDescription: current.description });
    return values !== null;
  }

  /**
   * The permission, the folders to take, then the import. Resolves to whether anything was
   * imported. Every way of not getting that far - no permission, no folders, cancelled -
   * goes back to the welcome.
   */
  private async importBookmarks(workspaceId: string): Promise<boolean> {
    if (!await requestBookmarksAccess()) {
      await showNotice(t('workspace.bookmarkImport.title'), t('workspace.bookmarkImport.noPermission'));
      return false;
    }
    const tree = await readBookmarkTree();
    const choices = this.viewModel.bookmarkChoices(tree);
    if (choices.length === 0) {
      await showNotice(t('workspace.bookmarkImport.title'), t('workspace.bookmarkImport.nothing'));
      return false;
    }
    const chosen = await new BookmarkImportDialog(
      choices,
      ticked => this.viewModel.importProblem(workspaceId, this.viewModel.bookmarkGroups(tree, ticked))
    ).ask();
    if (!chosen) return false;
    return this.viewModel.importGroups(workspaceId, this.viewModel.bookmarkGroups(tree, chosen));
  }
}
