import { t } from '../../i18n/i18n';
import { BookmarkImportDialog } from './bookmarkImportDialog';
import { showNotice } from './confirmations';
import { renderTiles, Tile } from './welcomeTiles';
import { readBookmarkTree, requestBookmarksAccess } from '../../utils/browserBookmarks';
import { WelcomeAction, welcomeActions, WorkspaceWelcomeViewModel } from '../../viewModel/workspaceWelcomeViewModel';

/**
 * What the workspace page lends the widget: its own dialogs, so a group is added and a
 * sign-in made exactly as from the page's buttons.
 */
export interface WelcomeDoors {
  /** Opens the add group dialog for this workspace. */
  addGroup(workspaceId: string): void;
  /** Starts the two-step sign-in: the method first, then its form (`signInStepByStep`). */
  signIn(): void;
  isSignedIn(): boolean;
}

/**
 * The widget an empty workspace shows where its columns would be (#182). It is part of the
 * page, not a dialog over it. It is four flat icon tiles: create a group (green), import the
 * browser's bookmarks, log in or set up sync (only while signed out), and Cancel (red).
 *
 * It is one element for the page's lifetime, placed by the workspace component, and `update`
 * shows or hides it as the workspace changes. It goes away by itself once the workspace has a
 * group. Cancel puts it away for good for that workspace on this browser.
 */
export class WorkspaceWelcome {

  public readonly element: HTMLElement = document.createElement('div');
  private workspaceId: string | null = null;

  constructor(
    private readonly viewModel: WorkspaceWelcomeViewModel,
    private readonly doors: WelcomeDoors
  ) {
    this.element.classList.add('workspace-welcome');
    this.element.hidden = true;
  }

  /** Shows the widget for this workspace when it is due, and hides it otherwise. */
  public update(workspaceId: string): void {
    this.workspaceId = workspaceId;
    if (!this.viewModel.isDue(workspaceId)) {
      this.element.hidden = true;
      this.element.replaceChildren();
      return;
    }
    this.element.replaceChildren(renderTiles(
      welcomeActions(this.doors.isSignedIn()).map(action => this.tile(action, workspaceId))));
    this.element.hidden = false;
  }

  private tile(action: WelcomeAction, workspaceId: string): Tile {
    switch (action) {
      case 'addGroup':
        return { icon: 'group', tone: 'add', label: t('workspace.welcome.addGroup'),
          onClick: () => this.doors.addGroup(workspaceId) };
      case 'importBookmarks':
        return { icon: 'bookmarks', tone: 'plain', label: t('workspace.welcome.importBookmarks'),
          // Straight on, with nothing awaited first: the permission prompt needs the click.
          onClick: () => void this.importBookmarks(workspaceId) };
      case 'signIn':
        return { icon: 'sync', tone: 'plain', label: t('workspace.welcome.signIn'),
          onClick: () => this.doors.signIn() };
      default:
        return { icon: 'cancel', tone: 'danger', label: t('common.cancel'),
          onClick: () => void this.dismiss(workspaceId) };
    }
  }

  private async dismiss(workspaceId: string): Promise<void> {
    await this.viewModel.dismiss(workspaceId);
    if (this.workspaceId === workspaceId) this.update(workspaceId);
  }

  /**
   * The permission, the folders to take, then the import. Whatever stops it short - no
   * permission, nothing to import, Cancel - leaves the widget where it was.
   */
  private async importBookmarks(workspaceId: string): Promise<void> {
    if (!await requestBookmarksAccess()) {
      await showNotice(t('workspace.bookmarkImport.title'), t('workspace.bookmarkImport.noPermission'));
      return;
    }
    const tree = await readBookmarkTree();
    const choices = this.viewModel.bookmarkChoices(tree);
    if (choices.length === 0) {
      await showNotice(t('workspace.bookmarkImport.title'), t('workspace.bookmarkImport.nothing'));
      return;
    }
    const chosen = await new BookmarkImportDialog(
      choices,
      ticked => this.viewModel.importProblem(workspaceId, this.viewModel.bookmarkGroups(tree, ticked))
    ).ask();
    if (chosen) {
      await this.viewModel.importGroups(workspaceId, this.viewModel.bookmarkGroups(tree, chosen));
    }
  }
}
