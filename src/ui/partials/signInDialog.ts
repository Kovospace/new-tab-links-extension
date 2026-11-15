import { t } from '../../i18n/i18n';
import { ChoiceDialog } from './choiceDialog';
import { InputDialog } from './inputDialog';
import { signInDeviceFields, wantsSync } from './signInFields';
import { SyncAccountViewModel } from '../../viewModel/syncAccountViewModel';

/** The two ways into an account. */
type SignInMethod = 'password' | 'syncCode';

/**
 * "Log in / set up sync" on the empty workspace's widget and on the page with no workspace
 * (#182), in two steps so nobody has to work out which fields are theirs.
 *
 * 1. The method: "I have a username and password" or "I have a sync code".
 * 2. That method's form only, with the device fields every sign-in dialog has.
 *
 * Cancelling the form goes back to step 1, because a wrong guess at the method is the likely
 * reason for it. Cancel on step 1 ends it. The menu keeps its two dialogs as they were.
 *
 * @param account  the account view model that signs in
 * @param signedIn what to do once a sign-in has worked and its dialog has closed
 */
export async function signInStepByStep(
  account: SyncAccountViewModel,
  signedIn: () => void
): Promise<void> {
  for (;;) {
    const method = await new ChoiceDialog<SignInMethod | 'cancel'>(
      t('sync.signInDialog.title'),
      t('sync.signInDialog.message'),
      [
        { label: t('sync.signInDialog.withPassword'), value: 'password' },
        { label: t('sync.signInDialog.withCode'), value: 'syncCode' },
        { label: t('common.cancel'), value: 'cancel', danger: true }
      ]
    ).ask();
    if (!method || method === 'cancel') return;

    const finished = await formFor(method, account, signedIn).ask();
    if (finished) return;
  }
}

/** The form of one method. Confirming signs in; the dialog closes only when that worked. */
function formFor(method: SignInMethod, account: SyncAccountViewModel, signedIn: () => void): InputDialog {
  const afterSignIn = (): void => void account.finishSignIn().then(signedIn);
  if (method === 'password') {
    return new InputDialog(
      t('sync.logInDialog.title'),
      {
        [t('sync.logInDialog.usernameOrEmail')]:
          { type: 'string', required: true, key: 'usernameOrEmail' },
        [t('sync.logInDialog.password')]:
          { type: 'password', required: true, key: 'password' },
        ...signInDeviceFields()
      },
      afterSignIn,
      ({ usernameOrEmail, password, deviceName, synchronise }) =>
        account.logIn(usernameOrEmail, password, deviceName, wantsSync(synchronise)));
  }
  return new InputDialog(
    t('sync.syncCodeDialog.title'),
    {
      [t('sync.syncCodeDialog.connectCode')]:
        { type: 'string', required: true, key: 'connectCode' },
      ...signInDeviceFields()
    },
    afterSignIn,
    ({ connectCode, deviceName, synchronise }) =>
      account.connectWithCode(connectCode, deviceName, wantsSync(synchronise)));
}
