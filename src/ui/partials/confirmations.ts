import { ChoiceDialog } from './choiceDialog';
import { InputDialog } from './inputDialog';
import { t } from '../../i18n/i18n';

/**
 * The two ways this UI asks "are you sure", and the difference between them.
 *
 * Both guard a deletion, and they are deliberately not the same guard. A yes/no is dismissed by
 * reflex, which is fine when the answer undoes one row the user can see, and is not fine when it
 * removes several at once - so the second one cannot be answered by reflex at all: it asks for a
 * phrase, and the only way to produce it is to have read the sentence above it.
 */

/**
 * Tells the user something, in the same modal every question here is asked in.
 *
 * This is what `alert()` was used for, and why it is not any more: the browser's box is drawn
 * by the browser, in its own fonts and its own place, and titled with the extension's address -
 * it reads as something other than this page talking.
 *
 * One button, not marked as dangerous, because nothing is being decided.
 *
 * @param title   heading, naming the situation
 * @param message what the user needs to know, in full sentences
 * @return resolves once the notice is dismissed, by its button or by Escape
 */
export async function showNotice(title: string, message: string): Promise<void> {
  await new ChoiceDialog<'ok'>(title, message, [
    { label: t('common.ok'), value: 'ok' }
  ]).ask();
}

/**
 * Asks a yes/no question about something destructive.
 *
 * @param title   heading, naming what is about to happen
 * @param message the question, in full sentences
 * @param confirmLabel wording of the button that goes ahead; says what it does, never "OK"
 * @return true when the user confirmed
 */
export async function confirmDestructiveAction(
  title: string,
  message: string,
  confirmLabel: string
): Promise<boolean> {
  const answer = await new ChoiceDialog<'yes' | 'no'>(title, message, [
    { label: confirmLabel, value: 'yes', danger: true },
    { label: t('common.cancel'), value: 'no' }
  ]).ask();

  return answer === 'yes';
}

/**
 * Asks the user to type a phrase before something destructive happens.
 *
 * The phrase is compared with surrounding space removed and case folded. Being strict about
 * either would only punish somebody who has already demonstrated they mean it - the point of
 * this is that the sentence was read, not that it was transcribed.
 *
 * @param title        heading, naming what is about to happen
 * @param message      what will happen, stated plainly and in full
 * @param requiredPhrase what has to be typed
 * @param confirmLabel wording of the button that goes ahead
 * @return true when the phrase was typed correctly
 */
export async function confirmByTypingPhrase(
  title: string,
  message: string,
  requiredPhrase: string,
  confirmLabel: string
): Promise<boolean> {
  const acknowledged = await confirmDestructiveAction(title, message, confirmLabel);
  if (!acknowledged) return false;

  const answer = await new InputDialog(
    title,
    { [t('dialogs.typeToConfirm', { phrase: requiredPhrase })]: { type: 'string', key: 'phrase' } },
    () => undefined
  ).ask();

  if (!answer) return false;

  const typed = Object.values(answer)[0] ?? '';
  return typed.trim().toLowerCase() === requiredPhrase.trim().toLowerCase();
}
