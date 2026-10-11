import { HistoryViewModel, VisitDayDTO } from '../../viewModel/historyViewModel';
import { PRIVACY_CATEGORY } from '../../viewModel/settingsViewModel';
import { SettingsDialog } from './settingsDialog';
import { confirmDestructiveAction } from './confirmations';
import { buildLogRow, buildOffNotice, LogRowWording } from './sidePanelRows';
import { t } from '../../i18n/i18n';
import { CLASS_ACTION_DANGER } from '../../constants';

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

    for (const day of days) {
      // The same heading the open tabs card puts over a window, and folded away like it.
      const heading = document.createElement('h3');
      heading.classList.add('closed-tabs__window');
      heading.textContent = day.label;
      this.listEl.appendChild(heading);

      for (const visit of day.visits) {
        this.listEl.appendChild(buildLogRow(visit, WORDING, {
          open: () => {
            this.viewModel.reopen(visit.id);
            this.onFinished();
          },
          forget: () => void this.viewModel.forget(visit.id)
        }));
      }
    }
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
