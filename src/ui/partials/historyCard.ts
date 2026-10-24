import { HistoryViewModel, VisitDayDTO } from '../../viewModel/historyViewModel';
import { PRIVACY_CATEGORY } from '../../viewModel/settingsViewModel';
import { SettingsDialog } from './settingsDialog';
import { confirmDestructiveAction } from './confirmations';
import { buildLogRow, buildOffNotice, LogRowWording } from './sidePanelRows';
import { t } from '../../i18n/i18n';
import { CLASS_ACTION_DANGER } from '../../constants';
import { ICON } from './wrappedHtmlElements';

const WORDING: LogRowWording = {
  rowTooltip: 'history.rowTooltip',
  happenedOn: 'history.visitedOn',
  alreadySaved: 'history.alreadySaved',
  saveAsLink: 'history.saveAsLink',
  forgetOne: 'history.forgetOne'
};

/**
 * The browsing history card of the side panel: the pages visited, grouped by day.
 *
 * **Each day folds.** The newest day starts open and every earlier one folded, because the
 * history is long and what is looked for is nearly always recent; a day opened or folded by
 * hand stays as it was left for as long as the page is open, across every redraw. Not stored:
 * which days somebody once unfolded is not worth a preference, and a key per day would grow
 * for ever.
 *
 * A card of its own rather than more of `ClosedTabsPanel`, which is the shell - the pointer,
 * the pin, the switcher - and was long enough already. The shell places the three parts this
 * makes (the list, the "history is off" notice and the Clear button for the head) and shows
 * them only while this card is chosen; this keeps them current.
 */
export class HistoryCard {

  public readonly listEl: HTMLElement;
  public readonly offEl: HTMLElement;
  public readonly clearEl: HTMLButtonElement;

  private unsubscribes: Array<() => void> = [];

  /** Days opened or folded by hand, by `VisitDayDTO.key`; true when open. */
  private readonly unfolded = new Map<string, boolean>();

  /**
   * @param viewModel  supplies the history and acts on it
   * @param onFinished called when an entry is opened, which ends the errand the panel was
   *                   opened for, as reopening a closed tab does
   * @param onRecording called with whether history is recorded, for the panel to show the
   *                   list or the notice
   */
  constructor(
    private readonly viewModel: HistoryViewModel,
    private readonly onFinished: () => void,
    private readonly onRecording: (recording: boolean) => void
  ) {
    this.listEl = document.createElement('div');
    this.listEl.classList.add('closed-tabs__list', 'closed-tabs__list--history');

    this.offEl = buildOffNotice(
      t('history.off.message'),
      t('history.off.openSettings'),
      () => new SettingsDialog().show(PRIVACY_CATEGORY));
    this.offEl.classList.add('closed-tabs__off--history');

    this.clearEl = document.createElement('button');
    this.clearEl.type = 'button';
    this.clearEl.classList.add('closed-tabs__head-action', 'closed-tabs__clear--history', CLASS_ACTION_DANGER);
    this.clearEl.textContent = t('history.clear');
    this.clearEl.title = t('history.forgetAll');
    this.clearEl.addEventListener('click', () => void this.clearAll());
  }

  /** Loads the history and keeps the card current. */
  public async initialize(): Promise<void> {
    this.unsubscribes.push(this.viewModel.observables.days.subscribe(days => this.draw(days)));
    this.unsubscribes.push(this.viewModel.observables.recording.subscribe(this.onRecording));
    await this.viewModel.initialize();
  }

  public dispose(): void {
    this.unsubscribes.forEach(unsubscribe => unsubscribe());
    this.unsubscribes = [];
    this.viewModel.dispose();
  }

  private draw(days: VisitDayDTO[]): void {
    this.listEl.replaceChildren();

    if (days.length === 0) {
      const empty = document.createElement('p');
      empty.classList.add('closed-tabs__empty');
      empty.textContent = t('history.empty');
      this.listEl.appendChild(empty);
      return;
    }

    days.forEach((day, index) =>
      this.listEl.appendChild(this.buildDay(day, this.unfolded.get(day.key) ?? index === 0)));
  }

  /** One day: a heading that folds it, and its visits under it. */
  private buildDay(day: VisitDayDTO, open: boolean): HTMLElement {
    const section = document.createElement('section');
    section.classList.add('closed-tabs__day');

    // The same heading the open tabs card puts over a window, and hidden with it while the
    // rail is narrow - folded, the rail shows the open days' favicons and nothing else.
    const heading = document.createElement('h3');
    heading.classList.add('closed-tabs__window');

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.classList.add('closed-tabs__day-toggle');

    const chevron = document.createElement('span');
    chevron.classList.add('closed-tabs__day-chevron');

    const label = document.createElement('span');
    label.textContent = day.label;

    const count = document.createElement('span');
    count.classList.add('closed-tabs__day-count');
    count.textContent = String(day.visits.length);

    toggle.append(chevron, label, count);
    heading.appendChild(toggle);

    const body = document.createElement('div');
    body.classList.add('closed-tabs__day-body');
    for (const visit of day.visits) {
      body.appendChild(buildLogRow(visit, WORDING, {
        open: () => {
          this.viewModel.reopen(visit.id);
          this.onFinished();
        },
        forget: () => void this.viewModel.forget(visit.id)
      }));
    }

    const show = (opened: boolean): void => {
      body.hidden = !opened;
      toggle.setAttribute('aria-expanded', String(opened));
      chevron.textContent = opened ? ICON.COLLAPSE : ICON.EXPAND;
    };
    show(open);
    toggle.addEventListener('click', () => {
      const opened = body.hidden;
      this.unfolded.set(day.key, opened);
      show(opened);
    });

    section.append(heading, body);
    return section;
  }

  /** Forgets the whole history, once, after asking. */
  private async clearAll(): Promise<void> {
    const confirmed = await confirmDestructiveAction(
      t('history.forgetAllConfirmation.title'),
      t('history.forgetAllConfirmation.message'),
      t('history.forgetAllConfirmation.confirm'));

    if (confirmed) {
      await this.viewModel.forgetAll();
    }
  }
}
