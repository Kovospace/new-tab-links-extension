import { ClosedTabDTO, ClosedTabsViewModel } from '../../viewModel/closedTabsViewModel';
import { BookmarkForm } from './bookmarkForm';
import { BookmarkViewModel } from '../../viewModel/bookmarkViewModel';
import { confirmDestructiveAction } from './confirmations';
import { ICON, toggleOverlay } from './wrappedHtmlElements';

/** Marks a closed tab whose address the profile already keeps. */
const ICON_KEPT = '📁';

/**
 * The panel of recently closed tabs.
 *
 * A drawer down the right-hand side rather than a column among the others: it is a log of
 * what happened, not a place things are kept, and giving it a column would put it in
 * competition with the links for the width of the screen. It slides over instead, and is
 * closed until asked for.
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

  /**
   * @param viewModel supplies the rows and acts on them; injectable for testing
   */
  constructor(viewModel: ClosedTabsViewModel = new ClosedTabsViewModel()) {
    this.viewModel = viewModel;
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
    await this.viewModel.initialize();
  }

  /** Whether the drawer is open. */
  public isOpen(): boolean {
    return this.panelEl?.classList.contains('closed-tabs--open') ?? false;
  }

  /** Opens the drawer, or closes it again. */
  public toggle(): void {
    this.panelEl?.classList.toggle('closed-tabs--open');
  }

  public dispose(): void {
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

    const title = document.createElement('h2');
    title.classList.add('closed-tabs__title');
    title.textContent = 'Recently closed';

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.classList.add('closed-tabs__head-action');
    clearBtn.textContent = 'Clear';
    clearBtn.title = 'Forget every closed tab';
    clearBtn.addEventListener('click', () => void this.clearAll());

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.classList.add('closed-tabs__head-action');
    closeBtn.textContent = ICON.CLOSE;
    closeBtn.title = 'Close the panel';
    closeBtn.addEventListener('click', () => this.toggle());

    head.appendChild(title);
    head.appendChild(clearBtn);
    head.appendChild(closeBtn);
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
      empty.textContent = 'Nothing closed yet. Tabs you close will appear here.';
      this.listEl.appendChild(empty);
      return;
    }

    tabs.forEach(tab => this.listEl!.appendChild(this.buildRow(tab)));
  }

  private buildRow(tab: ClosedTabDTO): HTMLElement {

    const row = document.createElement('div');
    row.classList.add('closed-tabs__row');

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
    text.title = `${tab.url}\nOpen again`;
    text.addEventListener('click', () => this.viewModel.reopen(tab.id));

    const title = document.createElement('span');
    title.classList.add('closed-tabs__row-title');
    title.textContent = tab.title;

    const meta = document.createElement('span');
    meta.classList.add('closed-tabs__meta');
    // The device is named only when it was not this one - see the view model.
    meta.textContent = tab.elsewhere ? `${tab.when} · ${tab.elsewhere}` : tab.when;

    text.appendChild(title);
    text.appendChild(meta);

    const actions = document.createElement('div');
    actions.classList.add('closed-tabs__row-actions');

    if (tab.bookmarked) {
      // Already kept somewhere in this profile. A mark rather than a hidden row: the tab was
      // still closed, and knowing it is already saved is the useful half of that.
      const kept = document.createElement('span');
      kept.classList.add('closed-tabs__kept');
      kept.textContent = ICON_KEPT;
      kept.title = 'Already saved in this profile';
      actions.appendChild(kept);
    }

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.classList.add('closed-tabs__row-action', 'add');
    addBtn.textContent = ICON.ADD;
    addBtn.title = 'Save as a link';
    addBtn.addEventListener('click', () => void this.addAsLink(tab));

    const forgetBtn = document.createElement('button');
    forgetBtn.type = 'button';
    forgetBtn.classList.add('closed-tabs__row-action');
    forgetBtn.textContent = ICON.DELETE;
    forgetBtn.title = 'Forget this one';
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
      await confirmDestructiveAction(
        'Nowhere to put it',
        'This profile has no group to keep a link in yet. Make a workspace and a group first.',
        'Close');
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
      'Forget every closed tab?',
      'The list is emptied on this profile, on every device you are signed in on. The tabs '
      + 'themselves are not affected, and anything you have already saved as a link stays.',
      'Forget them');

    if (confirmed) {
      await this.viewModel.forgetAll();
    }
  }
}
