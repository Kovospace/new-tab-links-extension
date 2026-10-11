import { ClosedTabDTO, ClosedTabsViewModel } from '../../viewModel/closedTabsViewModel';
import { BookmarkForm } from './bookmarkForm';
import { BookmarkViewModel } from '../../viewModel/bookmarkViewModel';
import { confirmDestructiveAction, showNotice } from './confirmations';
import { t } from '../../i18n/i18n';
import { ICON, toggleOverlay } from './wrappedHtmlElements';
import { makeDraggable } from '../dragAndDrop/dragAndDrop';
import { ObservableValue } from '../../utils/observableValue';
import { devicePreferencesRepository } from '../../backend/repository/DevicePreferencesRepository';
import {CLASS_ACTION_DANGER} from "../../constants";

/** Marks a closed tab whose address the profile already keeps. */

/**
 * The panel of recently closed tabs.
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
 * **The button takes precedence over all of that.** Pinned, the panel ignores the pointer and
 * stays open until it is unpinned, something outside it is clicked, or a row is opened - the
 * three ways of saying "done with this".
 *
 * **Where the list comes from matters to what this can promise.** The service worker records
 * a closure as it happens, so the panel fills whether or not a new tab page was open at the
 * time - and the list is the profile's, so it is the same list on every device the profile is
 * signed in on, which is why a row says where it was closed when that was somewhere else.
 */
export class ClosedTabsPanel {

  private readonly viewModel: ClosedTabsViewModel;

  private panelEl: HTMLElement | null = null;
  private listEl: HTMLElement | null = null;
  private unsubscribe: (() => void) | null = null;

  /** Held open by the button, which the pointer is not allowed to overrule. */
  private pinned: boolean = false;

  /**
   * Whether the panel is being held open, for anything that has to show it.
   *
   * Published rather than asked for, because the panel lets go of itself: a click outside it
   * or a row being opened unpins it without the button that pinned it being involved. A
   * button that only listened to its own clicks would go on looking pressed afterwards.
   */
  public readonly pinned$ = new ObservableValue<boolean>(false);

  /** The pending open, while the pointer is resting on the rail but has not stayed long enough. */
  private openTimer: ReturnType<typeof setTimeout> | null = null;

  /** The document listeners, kept so they can be taken off again. */
  private readonly pointerMoved = (event: MouseEvent) => this.followPointer(event);
  private readonly pointerLeft = (event: MouseEvent) => this.followPointerOut(event);
  private readonly clicked = (event: MouseEvent) => this.clickedSomewhere(event);

  /** How long the pointer has to rest on the rail, read each time it arrives. */
  private readonly openDelay: () => number;

  /**
   * @param viewModel supplies the rows and acts on them; injectable for testing
   * @param openDelay how long the pointer has to rest before the panel opens, in milliseconds;
   *                  asked each time rather than once, so a changed setting needs no reload
   */
  constructor(
      viewModel: ClosedTabsViewModel = new ClosedTabsViewModel(),
      openDelay: () => number = () => devicePreferencesRepository.getClosedTabsOpenDelay()
  ) {
    this.viewModel = viewModel;
    this.openDelay = openDelay;
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

    // On the document rather than on the panel: the rule is about where the pointer is on the
    // screen, including where the panel is not, which an element's own events cannot report.
    document.addEventListener("mousemove", this.pointerMoved);
    document.addEventListener("mouseout", this.pointerLeft);
    document.addEventListener("click", this.clicked);

    await this.viewModel.initialize();
  }

  /** Whether the panel is being held open by the button. */
  public isPinned(): boolean {
    return this.pinned;
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
   */
  public togglePinned(): void {
    this.cancelPendingOpen();
    this.setPinned(!this.pinned);
    this.setOpen(this.pinned);
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
    if (this.pinned || !this.panelEl) {
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
        this.setOpen(true);
        return;
      }
      // Started once and left running while the pointer moves within the rail: a pointer
      // stopping there sends no more events, so the timer is what has to finish the job.
      this.openTimer = setTimeout(() => {
        this.openTimer = null;
        this.setOpen(true);
      }, delay);
    }
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
   * a row, which is handled where that happens. A click on the button that pinned it is that
   * button's own business, or pinning would undo itself in the same gesture.
   */
  private clickedSomewhere(event: MouseEvent): void {
    if (!this.pinned) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target?.closest('.closed-tabs') || target?.closest('.action-closed-tabs')) {
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
    this.pinned$.set(pinned);
  }

  public dispose(): void {
    this.cancelPendingOpen();
    document.removeEventListener("mousemove", this.pointerMoved);
    document.removeEventListener("mouseout", this.pointerLeft);
    document.removeEventListener("click", this.clicked);
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.viewModel.dispose();
    this.panelEl?.remove();
    this.panelEl = null;
    this.listEl = null;
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
    title.textContent = t('closedTabs.title');

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.classList.add('closed-tabs__head-action', CLASS_ACTION_DANGER);
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
    head.appendChild(clearBtn);
    head.appendChild(pinBtn);
    panel.appendChild(head);

    this.listEl = document.createElement('div');
    this.listEl.classList.add('closed-tabs__list');
    panel.appendChild(this.listEl);

    return panel;
  }

  private drawRows(tabs: ClosedTabDTO[]): void {
    if (!this.listEl) return;
    this.listEl.replaceChildren();

    if (tabs.length === 0) {
      const empty = document.createElement('p');
      empty.classList.add('closed-tabs__empty');
      empty.textContent = t('closedTabs.empty');
      this.listEl.appendChild(empty);
      return;
    }

    tabs.forEach(tab => this.listEl!.appendChild(this.buildRow(tab)));
  }

  private buildRow(tab: ClosedTabDTO): HTMLElement {

    const row = document.createElement('div');
    row.classList.add('closed-tabs__row');
    row.title = t('closedTabs.rowTooltip', { url: tab.url });

    // The whole row reopens the tab, not only its text. Folded, the rail shows nothing but the
    // favicons - the text is not drawn at all - so a row that only answered to its text was a
    // column of icons that did nothing when clicked. The text stays a button, so a keyboard
    // can still reach it; its click bubbles here. The "+" and "x" are their own business.
    row.addEventListener('click', event => {
      if ((event.target as HTMLElement | null)?.closest('.closed-tabs__row-actions')) {
        return;
      }
      this.viewModel.reopen(tab.id);
      // Opening one is the end of the errand. Deleting one or saving one is not, so those
      // leave the panel where it is.
      this.setPinned(false);
      this.setOpen(false);
    });

    // Draggable out of the panel and onto a group, a subgroup or a place between two links.
    // It carries its address and title rather than only an identifier, because what it makes
    // over there is a new link: nothing in the workspace can look a closed tab up, and
    // nothing should have to reach into this panel to do it.
    makeDraggable(row, {
      kind: 'closedTab',
      id: tab.id,
      url: tab.url,
      title: tab.title
    });

    const icon = document.createElement('img');
    icon.classList.add('closed-tabs__favicon');
    icon.width = 16;
    icon.height = 16;
    icon.alt = '';
    icon.src = tab.faviconUrl ?? '/gfx/favicon-default.svg';
    icon.addEventListener('error', () => { icon.src = '/gfx/favicon-default.svg'; });

    const text = document.createElement('button');
    text.type = 'button';
    text.classList.add('closed-tabs__text');

    const title = document.createElement('span');
    title.classList.add('closed-tabs__row-title');
    title.textContent = tab.title;

    const meta = document.createElement('span');
    meta.classList.add('closed-tabs__meta');
    meta.textContent = tab.when;
    // The exact date makes the line long enough to be ellipsised in a narrow panel, and the
    // part cut off is the part asked for.
    meta.title = tab.when;

    text.appendChild(title);
    text.appendChild(meta);

    // A line of its own rather than a tail on the time: the rail is narrow, and two facts
    // sharing one line means the second is the one that gets ellipsised away. Drawn only when
    // the tab was closed somewhere else - see the view model, which decides that.
    if (tab.elsewhere) {
      const device = document.createElement('span');
      device.classList.add('closed-tabs__device');
      device.textContent = tab.elsewhere;
      device.title = t('closedTabs.closedOn', { device: tab.elsewhere });
      text.appendChild(device);
    }

    const actions = document.createElement('div');
    actions.classList.add('closed-tabs__row-actions');

    if (tab.bookmarked) {
      // Already kept somewhere in this profile. A mark rather than a hidden row: the tab was
      // still closed, and knowing it is already saved is the useful half of that.
      const kept = document.createElement('span');
      kept.classList.add('closed-tabs__kept');
      kept.textContent = ICON.CHECKED;
      kept.title = t('closedTabs.alreadySaved');
      actions.appendChild(kept);
    }

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.classList.add('closed-tabs__row-action', 'add');
    addBtn.textContent = ICON.ADD;
    addBtn.title = t('closedTabs.saveAsLink');
    addBtn.addEventListener('click', () => void this.addAsLink(tab));

    const forgetBtn = document.createElement('button');
    forgetBtn.type = 'button';
    forgetBtn.classList.add('closed-tabs__row-action', 'danger');
    forgetBtn.textContent = ICON.DELETE;
    forgetBtn.title = t('closedTabs.forgetOne');
    forgetBtn.addEventListener('click', () => void this.viewModel.forget(tab.id));

    actions.appendChild(addBtn);
    actions.appendChild(forgetBtn);

    row.appendChild(icon);
    row.appendChild(text);
    row.appendChild(actions);
    return row;
  }

  /**
   * Keeps a closed tab as a link.
   *
   * The bookmarking form again, in a dialog rather than in the popup window it was written
   * for: it is the same question - which group, which subgroup, under what name - and asking
   * it a second way here would be a second thing to keep working.
   */
  private async addAsLink(tab: ClosedTabDTO): Promise<void> {

    const viewModel = new BookmarkViewModel();
    if (!viewModel.canBookmark()) {
      await showNotice(
        t('closedTabs.nowhereToPut.title'),
        t('closedTabs.nowhereToPut.message'));
      return;
    }

    const dialog = document.createElement('dialog');
    dialog.classList.add('input-dialog', 'closed-tabs__dialog');
    document.body.appendChild(dialog);
    dialog.showModal();
    toggleOverlay(true);

    const form = new BookmarkForm(
      { url: tab.url, title: tab.title, favIconUrl: tab.faviconUrl },
      viewModel);

    await form.render(dialog);

    toggleOverlay(false);
    dialog.close();
    dialog.remove();
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
