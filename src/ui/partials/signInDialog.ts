import { t } from '../../i18n/i18n';
import { InputDialog } from './inputDialog';
import { signInDeviceFields, wantsSync } from './signInFields';
import { SyncAccountViewModel } from '../../viewModel/syncAccountViewModel';

/**
 * One dialog for both ways into an account (#182), opened by "Log in / set up sync" on the
 * empty workspace's widget and on the page shown with no workspace. Username and password,
 * then "or", then a sync code. The device fields follow, as in every sign-in dialog.
 *
 * No field is required on its own, because either half is enough. The submit check says
 * what is missing when neither half is filled in. A sync code wins when both are, since
 * typing one is the more deliberate act. The menu keeps its two separate dialogs.
 *
 * @param account  the account view model that signs in
 * @param signedIn what to do once the dialog has closed on a sign-in that worked
 */
export function combinedSignInDialog(
  account: SyncAccountViewModel,
  signedIn: () => void
): InputDialog {
  return new InputDialog(
    t('sync.signInDialog.title'),
    {
      [t('sync.logInDialog.usernameOrEmail')]: { type: 'string', key: 'usernameOrEmail' },
      [t('sync.logInDialog.password')]: { type: 'password', key: 'password' },
      [t('sync.syncCodeDialog.connectCode')]:
        { type: 'string', key: 'connectCode', separatorBefore: t('sync.signInDialog.or') },
      ...signInDeviceFields()
    },
    () => void account.finishSignIn().then(signedIn),
    async ({ usernameOrEmail, password, connectCode, deviceName, synchronise }) => {
      const code = connectCode?.trim();
      if (code) {
        return account.connectWithCode(code, deviceName, wantsSync(synchronise));
      }
      if (usernameOrEmail?.trim() && password) {
        return account.logIn(usernameOrEmail, password, deviceName, wantsSync(synchronise));
      }
      return t('sync.signInDialog.fillOne');
    });
}
