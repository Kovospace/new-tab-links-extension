import { t } from '../../i18n/i18n';
import { InputDialog } from './inputDialog';
import { combinedSignInDialog } from './signInDialog';
import { renderTiles } from './welcomeTiles';
import { MAX_DESCRIPTION_LENGTH, MAX_NAME_LENGTH } from '../../backend/sync/SyncContracts';
import { WorkspaceLessViewModel } from '../../viewModel/workspaceLessViewModel';
import { SyncAccountViewModel } from '../../viewModel/syncAccountViewModel';

/**
 * The page with no workspace (#182): what the new tab shows after the user deleted every
 * workspace of the open profile. It has a heading, a sentence and four flat icon tiles: create a
 * workspace (green), import links from a backup file, log in / set up sync (while signed
 * out), and Cancel (red),
 * which makes the starter workspace. Every action that lands reloads the page onto the
 * workspace.
 *
 * Drawn out of elements, never out of an HTML string, like the first-run screen it replaced.
 */
export function renderWorkspaceLessPage(
  host: HTMLElement,
  viewModel: WorkspaceLessViewModel,
  account: SyncAccountViewModel,
  signedIn: boolean
): void {
  const reloadIf = (landed: boolean): void => {
    if (landed) window.location.reload();
  };

  const createDialog = new InputDialog(
    t('workspace.addDialog.title'),
    {
      [t('workspace.addDialog.name')]:
        { type: 'string', required: true, maxLength: MAX_NAME_LENGTH, key: 'workspaceName' },
      [t('workspace.addDialog.description')]:
        { type: 'string', maxLength: MAX_DESCRIPTION_LENGTH, key: 'workspaceDescription' }
    },
    ({ workspaceName, workspaceDescription }) =>
      void viewModel.createWorkspace(workspaceName ?? '', workspaceDescription || undefined).then(reloadIf));

  // A sign-in reloads, as everything here does: start-up pulls the account's workspaces, so
  // the page comes back on them - or here again, when the account has none.
  const signInDialog = combinedSignInDialog(account, () => window.location.reload());

  const page = document.createElement('section');
  page.classList.add('workspace-less');

  const heading = document.createElement('h1');
  heading.textContent = t('workspace.workspaceLess.title');
  const message = document.createElement('p');
  message.textContent = t('workspace.workspaceLess.message');

  page.append(heading, message, renderTiles([
    { icon: 'workspace', tone: 'add', label: t('workspace.workspaceLess.create'),
      onClick: () => createDialog.show() },
    { icon: 'backup', tone: 'plain', label: t('workspace.workspaceLess.importBackup'),
      onClick: () => void viewModel.importBackup().then(reloadIf) },
    // Only while signed out, as on the empty workspace's widget.
    ...(signedIn ? [] : [{ icon: 'sync' as const, tone: 'plain' as const, label: t('workspace.welcome.signIn'),
      onClick: () => signInDialog.show() }]),
    { icon: 'cancel', tone: 'danger', label: t('common.cancel'),
      onClick: () => void viewModel.makeStarter().then(reloadIf) }
  ]));
  host.appendChild(page);
}
