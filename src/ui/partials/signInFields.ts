import { MAX_NAME_LENGTH } from '../../backend/sync/SyncContracts';
import { t } from '../../i18n/i18n';
import { FieldMap } from './inputDialog';

/**
 * The last two fields of every sign-in dialog - by password and by connect code, from the menu
 * and from the first-run screen: whether this browser synchronises, and what to call it.
 *
 * **The checkbox is asked before signing in, not after**, because storing the tokens is what
 * starts synchronisation, and first contact uploads this browser's links the moment it runs. A
 * switch reachable only once signed in would come too late for somebody signing in for
 * premium's limits alone. Unticked, the device name is drawn disabled: a name is what other
 * devices see this one as when it synchronises.
 *
 * "Device name" stays optional and last, so the required fields stay where the eye starts.
 * Leaving it blank keeps the automatic label; it earns its place only for somebody running
 * several browsers on one machine, where the automatic labels are all identical.
 */
export function signInDeviceFields(): FieldMap {
  return {
    [t('dialogs.fields.synchronise')]:
      { type: 'checkbox', checked: true, key: 'synchronise', enables: 'deviceName' },
    [t('dialogs.fields.deviceName')]:
      { type: 'string', maxLength: MAX_NAME_LENGTH, key: 'deviceName' }
  };
}

/** The checkbox's answer as the view model takes it. */
export function wantsSync(value: string | undefined): boolean {
  return value !== 'false';
}
