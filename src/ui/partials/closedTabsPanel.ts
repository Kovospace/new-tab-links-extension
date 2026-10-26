import { ClosedTabDTO, ClosedTabsViewModel } from '../../viewModel/closedTabsViewModel';
import { OpenTabDTO, OpenTabsViewModel, OpenTabWindowDTO } from '../../viewModel/openTabsViewModel';
import { HistoryViewModel } from '../../viewModel/historyViewModel';
import { HistoryCard } from './historyCard';
import {
  buildLogRow, buildOffNotice, favicon, keptMark, LogRowWording, rowButton, saveAsLink
} from './sidePanelRows';
import { PRIVACY_CATEGORY } from '../../viewModel/settingsViewModel';
import { SettingsDialog } from './settingsDialog';
import { confirmDestructiveAction } from './confirmations';
import { t } from '../../i18n/i18n';
import { ICON } from './wrappedHtmlElements';
import { makeDraggable } from '../dragAndDrop/dragAndDrop';
import {
  devicePreferencesRepository, SidePanelCard
} from '../../backend/repository/DevicePreferencesRepository';
import {CLASS_ACTION_DANGER} from "../../constants";

/** Where the panel remembers which card it shows; this device's preferences in normal use. */
export interface CardPreference {
  get(): SidePanelCard;
  set(card: SidePanelCard): Promise<void>;
}

const CLOSED_TAB_WORDING: LogRowWording = {
  rowTooltip: 'closedTabs.rowTooltip',
  happenedOn: 'closedTabs.closedOn',
  alreadySaved: 'closedTabs.alreadySaved',
  saveAsLink: 'closedTabs.saveAsLink',
  forgetOne: 'closedTabs.forgetOne'
};

/** The cards in the order the switcher offers them, with the catalogue file naming each. */
const CARDS: ReadonlyArray<[SidePanelCard, string]> =
  [['open', 'openTabs'], ['closed', 'closedTabs'], ['history', 'history']];

const deviceCardPreference: CardPreference = {
  get: () => devicePreferencesRepository.getSidePanelCard(),
  set: card => devicePreferencesRepository.setSidePanelCard(card)
};

/**
 * Where the panel learns whether it is kept open; this device's preferences in normal use.
 * Followed rather than read once, because Settings and other pages change it too.
 */
export interface KeepOpenPreference {
  set(keep: boolean): Promise<void>;
  /** Called at once with the current answer, then with every change; returns the way out. */
  follow(listener: (keep: boolean) => void): () => void;
}

const deviceKeepOpenPreference: KeepOpenPreference = {
  set: keep => devicePreferencesRepository.setKeepSidePanelOpen(keep),
  follow: listener => devicePreferencesRepository.preferences$
    .subscribe(preferences => listener(preferences.keepSidePanelOpen))
};

/**
 * The side panel: recently closed tabs, and the tabs open in this browser.
 *
 * **Three cards, one shown at a time** - open tabs, closed tabs and the browsing history -
 * chosen with a switcher under the head and remembered per device. The history card is its own
 * module (`historyCard.ts`); the rows all three draw are in `sidePanelRows.ts`. One list at full height rather than two stacked at half: either list can run to
 * hundreds of rows, and the folded rail shows the favicons of whichever card is chosen, which
 * only reads as something when they are all one kind of thing. The closed tabs card is what
 * the panel showed before it had a second one, and is the default.
 *
 * A rail down the right-hand edge, always there, showing the favicons of what was closed - and
 * widening into the full list when the pointer reaches it. No click is needed to look, which is
 * the point: the question this answers ("what was that thing I just closed?") is asked in
 * passing, and a panel that had to be opened first would be slower than pressing Ctrl+Shift+T
 * and hoping.
 *
 * **It is a column of the page's grid, not a thing laid over it.** Widening narrows the link
 * columns instead of covering them, which is what lets somebody drag a link into a group the
 * rail would otherwise be floating above - and what keeps it off the header's own buttons.
 *
 * **Opening is decided from where the pointer is, not by :hover.** Hover closes the panel the
 * instant the pointer crosses onto the scrollbar or into the gap beside it, which is exactly
 * where somebody reaching for the list is about to be. The rule instead is: to the right of the
 * panel's left edge - over it, or past it - is open; to the left of that edge is closed. That
 * keeps it open while the pointer is anywhere it could still be heading for the list, and it
 * cannot flap, because the edge it is compared against moves with the panel: closing puts the
 * edge to the right of the pointer, which is not a reason to open again.
 *
 * **Opening waits for the pointer to stay.** Closing is immediate, but the pointer has to rest
 * in that place before the panel widens - 300 ms unless this device's settings say
 * otherwise (`closedTabsOpenDelay`). The rail sits right under
 * the settings button, and a pointer on its way there crossed it and pulled the panel open
 * underneath - somebody heading for the list stops on it, somebody passing through does not.
 *
 * **Pinned, the panel ignores the pointer** and stays open until it is closed by its "x",
 * something outside it is clicked, or a row is opened - the three ways of saying "done with
 * this". It is pinned by the pointer opening it, when this device's settings say closing it
 * takes a click (`closeSidePanelOnClick`) - there is no button in the header for it any more.
 *
 * **Where the list comes from matters to what this can promise.** The service worker records
 * a closure as it happens, so the panel fills whether or not a new tab page was open at the
 * time - and the list is the profile's, so it is the same list on every device the profile is
 * signed in on, which is why a row says where it was closed when that was somewhere else.
 */
export class ClosedTabsPanel {

  private readonly viewModel: ClosedTabsViewModel;
  private readonly openTabs: OpenTabsViewModel;
  private readonly cardPreference: CardPreference;
  private readonly history: HistoryCard;

  private panelEl: HTMLElement | null = null;
  private titleEl: HTMLElement | null = null;
  private listEl: HTMLElement | null = null;
  private openListEl: HTMLElement | null = null;
  private offEl: HTMLElement | null = null;
  private cardButtons: Map<SidePanelCard, HTMLButtonElement> = new Map();

  /** What the search field holds, trimmed; it narrows the closed tabs and the history alike. */
  private query: string = '';
  private unsubscribe: (() => void) | null = null;
  private unsubscribeRecording: (() => void) | null = null;
  private unsubscribeOpenTabs: (() => void) | null = null;

  /** Held open until a click says otherwise, which the pointer is not allowed to overrule. */
  private pinned: boolean = false;

  /**
   * Kept open by the "Keep open" checkbox, for good: neither the pointer, nor a click
   * elsewhere, nor opening a row folds it. Outranks the pin, which is for one errand.
   */
  private keptOpen: boolean = false;
  private keepOpenBox: HTMLInputElement | null = null;
  private unsubscribeKeepOpen: (() => void) | null = null;

  /** The pending open, while the pointer is resting on the rail but has not stayed long enough. */
  private openTimer: ReturnType<typeof setTimeout> | null = null;

  /** The document listeners, kept so they can be taken off again. */
  private readonly pointerMoved = (event: MouseEvent) => this.followPointer(event);
  private readonly pointerLeft = (event: MouseEvent) => this.followPointerOut(event);
  private readonly clicked = (event: MouseEvent) => this.clickedSomewhere(event);

  /** How long the pointer has to rest on the rail, read each time it arrives. */
  private readonly openDelay: () => number;

  /** Whether a panel the pointer opens waits for a click to close, read each time it opens. */
  private readonly closeOnClick: () => boolean;

  /**
   * @param viewModel supplies the rows and acts on them; injectable for testing
   * @param openDelay how long the pointer has to rest before the panel opens, in milliseconds;
   *                  asked each time rather than once, so a changed setting needs no reload
   * @param openTabs  supplies the open tabs card and acts on it; injectable for testing
   * @param cardPreference where the chosen card is remembered; injectable for testing
   * @param history   supplies the browsing history card; injectable for testing
   * @param keepOpenPreference whether the panel is kept open; injectable for testing
   * @param closeOnClick whether a panel the pointer opens stays open until a click; asked each
   *                     time it opens, so a changed setting needs no reload
   */
  constructor(
      viewModel: ClosedTabsViewModel = new ClosedTabsViewModel(),
      openDelay: () => number = () => devicePreferencesRepository.getClosedTabsOpenDelay(),
      openTabs: OpenTabsViewModel = new OpenTabsViewModel(),
      cardPreference: CardPreference = deviceCardPreference,
      history: HistoryViewModel = new HistoryViewModel(),
      private readonly keepOpenPreference: KeepOpenPreference = deviceKeepOpenPreference,
      closeOnClick: () => boolean = () => devicePreferencesRepository.getCloseSidePanelOnClick()
  ) {
    this.viewModel = viewModel;
    this.openDelay = openDelay;
    this.closeOnClick = closeOnClick;
    this.openTabs = openTabs;
    this.cardPreference = cardPreference;
    this.history = new HistoryCard(
      history,
      () => this.finishErrand(),
      recording => this.panelEl?.classList.toggle('closed-tabs--history-off', !recording));
  }

  /**
   * Draws the panel, closed, and keeps it current.
   *
   * @param host where the panel lives; the page body in normal use
   */
  public async render(host: HTMLElement): Promise<void> {

    this.panelEl = this.build();
    host.appendChild(this.panelEl);

    this.unsubscribe = this.viewModel.observables.tabs.subscribe(tabs => this.drawRows(tabs));
    this.unsubscribeRecording = this.viewModel.observables.recording
      .subscribe(recording => this.drawRecording(recording));
    this.unsubscribeOpenTabs = this.openTabs.observables.windows
      .subscribe(windows => this.drawOpenTabs(windows));
    this.showCard(this.cardPreference.get());
    this.unsubscribeKeepOpen = this.keepOpenPreference.follow(keep => this.keepOpen(keep));

    // On the document rather than on the panel: the rule is about where the pointer is on the
    // screen, including where the panel is not, which an element's own events cannot report.
    document.addEventListener("mousemove", this.pointerMoved);
    document.addEventListener("mouseout", this.pointerLeft);
    document.addEventListener("click", this.clicked);

    await this.viewModel.initialize();
    await this.openTabs.initialize();
    await this.history.initialize();
  }

  /** Whether the panel is being held open, until a click or by "Keep open". */
  public isPinned(): boolean {
    return this.pinned || this.keptOpen;
  }

  /** Whether the panel is showing its full width, however that came about. */
  public isOpen(): boolean {
    return this.panelEl?.classList.contains('closed-tabs--open') ?? false;
  }

  /**
   * Holds the panel open, or lets go of it.
   *
   * Letting go closes it rather than handing it back to the pointer where it stands: the
   * button was pressed to say "done", and a panel that stayed open until the pointer happened
   * to move would look like the button had not worked.
   *
   * A panel kept open is let go of the same way - the button is pressed to close it, and a
   * button that did nothing while "Keep open" was ticked would look broken - and that unticks
   * "Keep open", on this device, for good.
   */
  public togglePinned(): void {
    this.cancelPendingOpen();
    if (this.keptOpen) {
      void this.keepOpenPreference.set(false);
      this.keepOpen(false);
      this.setPinned(false);
      this.setOpen(false);
      return;
    }
    this.setPinned(!this.pinned);
    this.setOpen(this.pinned);
  }

  /**
   * Keeps the panel open, or hands it back to the pointer.
   *
   * Handed back, it stays open where it is and the pointer's next move decides - the
   * checkbox that was just unticked is inside the panel, so the pointer is on it.
   */
  private keepOpen(keep: boolean): void {
    this.keptOpen = keep;
    if (this.keepOpenBox) {
      this.keepOpenBox.checked = keep;
    }
    if (keep) {
      this.cancelPendingOpen();
      this.setOpen(true);
    }
  }

  /**
   * Follows the pointer, unless the button has taken the decision away.
   *
   * Two comparisons, and the second one is not optional. At or right of the panel's left edge
   * keeps it open - over the panel, or past it onto the scrollbar and the window edge, because
   * somebody on their way to the list should not lose it by overshooting. But only between the
   * panel's own top and bottom: the rail is a column of the page's grid and starts below the
   * header, so "far enough right" on its own is also true of the application menu and the
   * settings button up in the corner, and reaching for those opened the panel underneath them.
   */
  private followPointer(event: MouseEvent): void {
    this.followPointerAt(event.clientX, event.clientY);
  }

  /**
   * Follows the pointer out of the page, which a mousemove never reports.
   *
   * In a maximised window the last pixel or two at the screen's edge can belong to the window
   * frame rather than to the page. A pointer flung at that edge sends its last mousemove from
   * somewhere left of the rail and its next position is already outside the page - so no
   * event ever arrived over the rail, nothing in it so much as lit up, and it never opened.
   * Leaving the page is reported, as a mouseout with nowhere to go, and where it left is read
   * as the nearest point still inside: out through the right edge beside the rail is "on the
   * rail", out through the top is "above it".
   */
  private followPointerOut(event: MouseEvent): void {
    if (event.relatedTarget !== null) {
      return;     // only into another element of this page, which a mousemove will report
    }
    const x = Math.min(Math.max(event.clientX, 0), window.innerWidth - 1);
    const y = Math.min(Math.max(event.clientY, 0), window.innerHeight - 1);
    this.followPointerAt(x, y);
  }

  private followPointerAt(clientX: number, clientY: number): void {
    if (this.pinned || this.keptOpen || !this.panelEl) {
      return;
    }
    // Measured now rather than remembered: the edge moves with the panel, and that is what
    // stops this flapping. Closed, the edge is the rail's; open, it is the full panel's, so a
    // pointer that has just closed it is left of the narrower edge too. The top and bottom do
    // not move, so they need no such care.
    const panel = this.panelEl.getBoundingClientRect();
    const besideIt = clientY >= panel.top && clientY <= panel.bottom;
    const wantsOpen = besideIt && clientX >= panel.left;

    if (!wantsOpen) {
      this.cancelPendingOpen();
      this.setOpen(false);
    } else if (!this.isOpen() && this.openTimer === null) {
      const delay = this.openDelay();
      if (delay <= 0) {
        this.openForPointer();
        return;
      }
      // Started once and left running while the pointer moves within the rail: a pointer
      // stopping there sends no more events, so the timer is what has to finish the job.
      this.openTimer = setTimeout(() => {
        this.openTimer = null;
        this.openForPointer();
      }, delay);
    }
  }

  /**
   * Opens the panel because the pointer stayed on the rail - and, when closing it takes a
   * click on this device, pins it there, so the pointer moving off no longer folds it.
   */
  private openForPointer(): void {
    if (this.closeOnClick()) {
      this.setPinned(true);
    }
    this.setOpen(true);
  }

  private cancelPendingOpen(): void {
    if (this.openTimer !== null) {
      clearTimeout(this.openTimer);
      this.openTimer = null;
    }
  }

  /**
   * Ends a pinned panel when the user's attention plainly went elsewhere.
   *
   * A click inside the panel is the panel being used, and does not count - except for opening
   * a row, which is handled where that happens.
   */
  private clickedSomewhere(event: MouseEvent): void {
    if (!this.pinned || this.keptOpen) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target?.closest('.closed-tabs')) {
      return;
    }
    this.setPinned(false);
    this.setOpen(false);
  }

  private setOpen(open: boolean): void {
    if (!open) {
      this.releaseFocus();
    }
    this.panelEl?.classList.toggle('closed-tabs--open', open);
  }

  /**
   * Lets go of whatever inside the panel holds the focus, as the panel folds.
   *
   * A row's actions are revealed by `:focus-within` as well as by `:hover`, because somebody
   * arriving by keyboard has no pointer to reveal them with. But a press is a focus too: the
   * row's text is a button, and dragging a row out of the panel leaves it focused - so the
   * "+" and the "x" of that one row stayed lit after the panel folded, came back lit the next
   * time it opened with the pointer nowhere near them, and only went out when something else
   * was clicked. Which is precisely the description of a focus nobody had moved.
   *
   * Folding is the right moment to drop it, and not only for that: a folded rail is two and a
   * half characters wide and draws none of what could be focused, so focus inside it is focus
   * the user cannot see and cannot follow. The panel the button is holding open is left alone
   * - that one is being used.
   */
  private releaseFocus(): void {
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && this.panelEl?.contains(focused)) {
      focused.blur();
    }
  }

  private setPinned(pinned: boolean): void {
    this.pinned = pinned;
  }

  public dispose(): void {
    this.cancelPendingOpen();
    this.unsubscribeKeepOpen?.();
    this.unsubscribeKeepOpen = null;
    document.removeEventListener("mousemove", this.pointerMoved);
    document.removeEventListener("mouseout", this.pointerLeft);
    document.removeEventListener("click", this.clicked);
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.unsubscribeRecording?.();
    this.unsubscribeRecording = null;
    this.unsubscribeOpenTabs?.();
    this.unsubscribeOpenTabs = null;
    this.viewModel.dispose();
    this.openTabs.dispose();
    this.history.dispose();
    this.panelEl?.remove();
    this.panelEl = null;
    this.titleEl = null;
    this.listEl = null;
    this.openListEl = null;
    this.cardButtons.clear();
  }

  private build(): HTMLElement {

    const panel = document.createElement('aside');
    panel.classList.add('closed-tabs');

    const head = document.createElement('div');
    head.classList.add('closed-tabs__head');

    // What the rail shows of itself when it is only two and a half characters wide. Without
    // it a column of favicons down the edge of the screen is a mystery rather than an offer.
    const mark = document.createElement('span');
    mark.classList.add('closed-tabs__mark');
    mark.textContent = ICON.HISTORY;
    mark.title = t('closedTabs.railTooltip');
    head.appendChild(mark);

    const title = document.createElement('h2');
    title.classList.add('closed-tabs__title');
    this.titleEl = title;

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.classList.add('closed-tabs__head-action', 'closed-tabs__clear', CLASS_ACTION_DANGER);
    clearBtn.textContent = t('closedTabs.clear');
    clearBtn.title = t('closedTabs.forgetAll');
    clearBtn.addEventListener('click', () => void this.clearAll());

    const pinBtn = document.createElement('button');
    pinBtn.type = 'button';
    pinBtn.classList.add('closed-tabs__head-action');
    pinBtn.textContent = ICON.CLOSE;
    pinBtn.title = t('closedTabs.closePanel');
    pinBtn.addEventListener('click', () => this.togglePinned());

    head.appendChild(title);
    head.appendChild(this.buildKeepOpen());
    head.appendChild(clearBtn);
    head.appendChild(this.history.clearEl);
    head.appendChild(pinBtn);
    panel.appendChild(head);
    panel.appendChild(this.buildCardSwitcher());
    panel.appendChild(this.buildSearch());

    this.openListEl = document.createElement('div');
    this.openListEl.classList.add('closed-tabs__list', 'closed-tabs__list--open');
    panel.appendChild(this.openListEl);

    this.listEl = document.createElement('div');
    this.listEl.classList.add('closed-tabs__list', 'closed-tabs__list--closed');
    panel.appendChild(this.listEl);

    // What the panel says while the profile does not record closed tabs. The panel stays
    // rather than going away - a rail that vanished would leave nothing to say where it went.
    this.offEl = buildOffNotice(
      t('closedTabs.off.message'),
      t('closedTabs.off.openSettings'),
      () => new SettingsDialog().show(PRIVACY_CATEGORY));
    panel.appendChild(this.offEl);

    panel.appendChild(this.history.listEl);
    panel.appendChild(this.history.offEl);

    return panel;
  }

  /**
   * The "Keep open" checkbox. A checkbox rather than a button, because it is a state that
   * lasts - on this device, across new tabs - where the pin is one errand's worth.
   */
  private buildKeepOpen(): HTMLElement {
    const label = document.createElement('label');
    label.classList.add('closed-tabs__keep-open');
    label.title = t('closedTabs.keepOpen.tooltip');

    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = this.keptOpen;
    box.addEventListener('change', () => {
      this.keepOpen(box.checked);
      void this.keepOpenPreference.set(box.checked);
    });
    this.keepOpenBox = box;

    const text = document.createElement('span');
    text.textContent = t('closedTabs.keepOpen.label');

    label.append(box, text);
    return label;
  }

  /** The buttons that choose between the cards, open tabs first as the browser has them. */
  private buildCardSwitcher(): HTMLElement {
    const switcher = document.createElement('div');
    switcher.classList.add('closed-tabs__cards');
    switcher.setAttribute('role', 'group');

    for (const [card, wording] of CARDS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.classList.add('closed-tabs__card');
      button.textContent = t(`${wording}.card`);
      button.title = t(`${wording}.cardTooltip`);
      button.addEventListener('click', () => this.chooseCard(card));
      this.cardButtons.set(card, button);
      switcher.appendChild(button);
    }
    return switcher;
  }

  /**
   * The field that narrows the closed tabs and the history, which are logs long enough to need
   * it. One field for both, and it keeps what was typed when the card changes: somebody who
   * did not find a page among the closed tabs looks next in the history, for the same words.
   * The open tabs are as many as the tab strip holds and are not searched; the stylesheet hides
   * the field on that card, and while the panel is folded.
   */
  private buildSearch(): HTMLElement {
    const field = document.createElement('input');
    field.type = 'search';
    field.classList.add('closed-tabs__search', 'editable', 'input-dialog__input');
    field.placeholder = t('closedTabs.search.placeholder');
    field.setAttribute('aria-label', t('closedTabs.search.label'));
    field.addEventListener('input', () => this.search(field.value));
    return field;
  }

  private search(typed: string): void {
    this.query = typed.trim();
    this.viewModel.setQuery(this.query);
    this.history.setQuery(this.query);
  }

  /** Shows a card and remembers it for the next new tab on this device. */
  private chooseCard(card: SidePanelCard): void {
    this.showCard(card);
    void this.cardPreference.set(card);
  }

  /**
   * Shows one card. Which list, notice and head button go with it is the stylesheet's,
   * keyed off `data-card`, so nothing here has to hide anything by hand.
   */
  private showCard(card: SidePanelCard): void {
    if (!this.panelEl) return;
    this.panelEl.dataset.card = card;
    if (this.titleEl) {
      const wording = CARDS.find(([key]) => key === card)?.[1] ?? 'closedTabs';
      this.titleEl.textContent = t(`${wording}.title`);
    }
    this.cardButtons.forEach((button, key) =>
      button.setAttribute('aria-pressed', String(key === card)));
  }

  /** Swaps the list for the notice, and back, as recording is turned off and on. */
  private drawRecording(recording: boolean): void {
    this.panelEl?.classList.toggle('closed-tabs--off', !recording);
  }

  private drawRows(tabs: ClosedTabDTO[]): void {
    if (!this.listEl) return;
    this.listEl.replaceChildren();

    if (tabs.length === 0) {
      const empty = document.createElement('p');
      empty.classList.add('closed-tabs__empty');
      empty.textContent = this.query
        ? t('closedTabs.search.noMatch', { query: this.query })
        : t('closedTabs.empty');
      this.listEl.appendChild(empty);
      return;
    }

    tabs.forEach(tab => this.listEl!.appendChild(buildLogRow(tab, CLOSED_TAB_WORDING, {
      open: () => {
        this.viewModel.reopen(tab.id);
        this.finishErrand();
      },
      forget: () => void this.viewModel.forget(tab.id)
    })));
  }

  private drawOpenTabs(windows: OpenTabWindowDTO[]): void {
    if (!this.openListEl) return;
    this.openListEl.replaceChildren();

    if (windows.length === 0) {
      const empty = document.createElement('p');
      empty.classList.add('closed-tabs__empty');
      empty.textContent = t('openTabs.empty');
      this.openListEl.appendChild(empty);
      return;
    }

    for (const window of windows) {
      if (window.label) {
        const heading = document.createElement('h3');
        heading.classList.add('closed-tabs__window');
        heading.textContent = window.label;
        this.openListEl.appendChild(heading);
      }
      window.tabs.forEach(tab => this.openListEl!.appendChild(this.buildOpenRow(tab)));
    }
  }

  /**
   * One open tab: the same row as a closed one, answering differently. A click switches to the
   * tab, which is the end of the errand as reopening is; the "x" closes the tab itself.
   */
  private buildOpenRow(tab: OpenTabDTO): HTMLElement {

    const row = document.createElement('div');
    row.classList.add('closed-tabs__row');
    row.title = t('openTabs.rowTooltip', { url: tab.url });

    row.addEventListener('click', event => {
      if ((event.target as HTMLElement | null)?.closest('.closed-tabs__row-actions')) {
        return;
      }
      void this.openTabs.activate(tab.id);
      this.finishErrand();
    });

    // The same payload a closed tab carries: what it makes on the other side is a new link,
    // and the tab stays open - it is not moved anywhere, only kept.
    makeDraggable(row, { kind: 'panelTab', id: String(tab.id), url: tab.url, title: tab.title });

    const text = document.createElement('button');
    text.type = 'button';
    text.classList.add('closed-tabs__text');

    const title = document.createElement('span');
    title.classList.add('closed-tabs__row-title');
    title.textContent = tab.title;
    text.appendChild(title);

    const actions = document.createElement('div');
    actions.classList.add('closed-tabs__row-actions');

    if (tab.bookmarked) {
      actions.appendChild(keptMark(t('openTabs.alreadySaved')));
    }
    actions.appendChild(rowButton(ICON.ADD, 'add', t('openTabs.saveAsLink'),
      () => void saveAsLink(tab)));
    actions.appendChild(rowButton(ICON.DELETE, 'danger', t('openTabs.closeTab'),
      () => void this.openTabs.close(tab.id)));

    row.appendChild(favicon(tab.faviconUrl));
    row.appendChild(text);
    row.appendChild(actions);
    return row;
  }

  /**
   * Opening something from the panel is the end of the errand it was opened for. Deleting one
   * or saving one is not, so those leave the panel where it is - and so does everything while
   * the panel is kept open.
   */
  private finishErrand(): void {
    if (this.keptOpen) {
      return;
    }
    this.setPinned(false);
    this.setOpen(false);
  }

  /** Forgets everything, once, after asking. */
  private async clearAll(): Promise<void> {
    const confirmed = await confirmDestructiveAction(
      t('closedTabs.forgetAllConfirmation.title'),
      t('closedTabs.forgetAllConfirmation.message'),
      t('closedTabs.forgetAllConfirmation.confirm'));

    if (confirmed) {
      await this.viewModel.forgetAll();
    }
  }
}
