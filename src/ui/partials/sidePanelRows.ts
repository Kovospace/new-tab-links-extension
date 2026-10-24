import { BookmarkForm } from './bookmarkForm';
import { BookmarkViewModel } from '../../viewModel/bookmarkViewModel';
import { t } from '../../i18n/i18n';
import { ICON, toggleOverlay } from './wrappedHtmlElements';
import { makeDraggable } from '../dragAndDrop/dragAndDrop';

/**
 * The rows of the side panel's cards, shared by the cards that draw them.
 *
 * The closed tabs and the browsing history are both logs - something that happened somewhere,
 * at some time - so they draw the same row: favicon, title, when, where if not here, and a
 * "+" and an "x". What the row does when used is the card's business and is passed in.
 */

/** One entry of a log, as a card draws it. */
export interface LogEntry {
  id: string;
  title: string;
  url: string;
  faviconUrl?: string;
  /** How long ago and when exactly, already worded. */
  when: string;
  /** The device it happened on, or null when that was this one. */
  elsewhere: string | null;
  bookmarked: boolean;
}

/** The wording of one kind of log row, as keys into the catalogue. */
export interface LogRowWording {
  /** Takes `{url}`. */
  rowTooltip: string;
  /** Takes `{device}`. */
  happenedOn: string;
  alreadySaved: string;
  saveAsLink: string;
  forgetOne: string;
}

/** What a log row does when used. */
export interface LogRowActions {
  /** The row itself was clicked: open the page again. The card decides what else follows. */
  open(): void;
  forget(): void;
}

/**
 * One log entry as a row.
 *
 * **The whole row opens the page, not only its text.** Folded, the rail shows nothing but the
 * favicons - the text is not drawn at all - so a row that only answered to its text was a
 * column of icons that did nothing when clicked. The text stays a button, so a keyboard can
 * still reach it; its click bubbles to the row. The "+" and "x" are their own business.
 */
export function buildLogRow(entry: LogEntry, wording: LogRowWording, actions: LogRowActions): HTMLElement {

  const row = document.createElement('div');
  row.classList.add('closed-tabs__row');
  row.title = t(wording.rowTooltip, { url: entry.url });

  row.addEventListener('click', event => {
    if ((event.target as HTMLElement | null)?.closest('.closed-tabs__row-actions')) {
      return;
    }
    actions.open();
  });

  // Draggable out of the panel and onto a group, a subgroup or a place between two links. It
  // carries its address and title rather than only an identifier, because what it makes over
  // there is a new link: nothing in the workspace can look the entry up, and nothing should
  // have to reach into this panel to do it.
  makeDraggable(row, { kind: 'panelTab', id: entry.id, url: entry.url, title: entry.title });

  const text = document.createElement('button');
  text.type = 'button';
  text.classList.add('closed-tabs__text');

  const title = document.createElement('span');
  title.classList.add('closed-tabs__row-title');
  title.textContent = entry.title;

  const meta = document.createElement('span');
  meta.classList.add('closed-tabs__meta');
  meta.textContent = entry.when;
  // The exact date makes the line long enough to be ellipsised in a narrow panel, and the
  // part cut off is the part asked for.
  meta.title = entry.when;

  text.appendChild(title);
  text.appendChild(meta);

  // A line of its own rather than a tail on the time: the rail is narrow, and two facts
  // sharing one line means the second is the one that gets ellipsised away. Drawn only when it
  // happened somewhere else - the view model decides that.
  if (entry.elsewhere) {
    const device = document.createElement('span');
    device.classList.add('closed-tabs__device');
    device.textContent = entry.elsewhere;
    device.title = t(wording.happenedOn, { device: entry.elsewhere });
    text.appendChild(device);
  }

  const buttons = document.createElement('div');
  buttons.classList.add('closed-tabs__row-actions');

  if (entry.bookmarked) {
    buttons.appendChild(keptMark(t(wording.alreadySaved)));
  }
  buttons.appendChild(rowButton(ICON.ADD, 'add', t(wording.saveAsLink), () => void saveAsLink(entry)));
  buttons.appendChild(rowButton(ICON.DELETE, 'danger', t(wording.forgetOne), () => actions.forget()));

  row.appendChild(favicon(entry.faviconUrl));
  row.appendChild(text);
  row.appendChild(buttons);
  return row;
}

/** One of a row's own buttons - "+", "x" - which the row's click leaves alone. */
export function rowButton(label: string, kind: string, title: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.classList.add('closed-tabs__row-action', kind);
  button.textContent = label;
  button.title = title;
  button.addEventListener('click', onClick);
  return button;
}

/** A row's favicon, falling back to the default one when the page has none or it fails. */
export function favicon(url: string | undefined): HTMLImageElement {
  const icon = document.createElement('img');
  icon.classList.add('closed-tabs__favicon');
  icon.width = 16;
  icon.height = 16;
  icon.alt = '';
  icon.src = url ?? '/gfx/favicon-default.svg';
  icon.addEventListener('error', () => { icon.src = '/gfx/favicon-default.svg'; });
  return icon;
}

/**
 * Already kept somewhere in this profile. A mark rather than a hidden row: the entry is still
 * worth seeing, and knowing it is already saved is the useful half of that.
 */
export function keptMark(title: string): HTMLElement {
  const kept = document.createElement('span');
  kept.classList.add('closed-tabs__kept');
  kept.textContent = ICON.CHECKED;
  kept.title = title;
  return kept;
}

/**
 * A notice that fills a card in place of its list: what is off, and a button that opens the
 * place it is turned back on.
 */
export function buildOffNotice(message: string, buttonLabel: string, onOpen: () => void): HTMLElement {
  const notice = document.createElement('div');
  notice.classList.add('closed-tabs__off');

  const text = document.createElement('p');
  text.classList.add('closed-tabs__off-message');
  text.textContent = message;

  const open = document.createElement('button');
  open.type = 'button';
  open.classList.add('closed-tabs__off-action');
  open.textContent = buttonLabel;
  open.addEventListener('click', onOpen);

  notice.appendChild(text);
  notice.appendChild(open);
  return notice;
}

/**
 * Keeps an entry of any card as a link.
 *
 * The bookmarking form again, in a dialog rather than in the popup window it was written for:
 * it is the same question - which group, which subgroup, under what name - and asking it a
 * second way here would be a second thing to keep working.
 */
export async function saveAsLink(entry: { url: string; title: string; faviconUrl?: string }): Promise<void> {

  const viewModel = new BookmarkViewModel();

  const dialog = document.createElement('dialog');
  dialog.classList.add('input-dialog', 'closed-tabs__dialog');
  document.body.appendChild(dialog);
  dialog.showModal();
  toggleOverlay(true);

  const form = new BookmarkForm(
    { url: entry.url, title: entry.title, favIconUrl: entry.faviconUrl },
    viewModel);

  await form.render(dialog);

  toggleOverlay(false);
  dialog.close();
  dialog.remove();
}
