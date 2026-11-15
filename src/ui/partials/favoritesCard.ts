import { t } from '../../i18n/i18n';
import { favicon, rowButton } from './sidePanelRows';
import { favoriteToggle } from './favoriteControls';
import { ICON } from './wrappedHtmlElements';
import { makeContainerTarget } from '../dragAndDrop/dragAndDrop';
import { FaviconsHandler } from '../backgroundWorkerCommands/faviconsHandler';
import { FavoritesViewModel } from '../../viewModel/favoritesViewModel';
import { FavoriteDTO } from '../../viewModel/favorites';

/**
 * The side panel's Favorites card (#183): the open workspace's favorites, in the order the page
 * draws them. It is a card like the others - its own list, shown while `data-card` says so - and
 * its switcher button is shown only while the profile uses favorites.
 *
 * **A link dragged onto the list becomes a favorite and stays in its group.** The list takes the
 * drop as a container does - "in here" - and nothing is moved.
 *
 * A row opens the link here, as the page does; its last button opens it in a new tab; its
 * golden circle unmarks it.
 */
export class FavoritesCard {

  public readonly listEl: HTMLElement = document.createElement('div');
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly viewModel: FavoritesViewModel,
    private readonly onFinished: () => void,
    private readonly onEnabled: (enabled: boolean) => void
  ) {
    this.listEl.classList.add('closed-tabs__list', 'closed-tabs__list--favorites');
    makeContainerTarget(this.listEl, 'link', linkId => void this.viewModel.markFavorite(linkId));
  }

  public initialize(): void {
    this.viewModel.initialize();
    const favorites = this.viewModel.observables.favorites.subscribe(list => this.draw(list));
    const enabled = this.viewModel.observables.enabled.subscribe(on => this.onEnabled(on));
    this.unsubscribe = () => { favorites(); enabled(); };
  }

  public dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.viewModel.dispose();
  }

  private draw(favorites: FavoriteDTO[]): void {
    if (favorites.length === 0) {
      const empty = document.createElement('p');
      empty.classList.add('closed-tabs__empty');
      empty.textContent = t('favorites.empty');
      this.listEl.replaceChildren(empty);
      return;
    }
    this.listEl.replaceChildren(...favorites.map(favorite => this.row(favorite)));
  }

  private row(favorite: FavoriteDTO): HTMLElement {
    const row = document.createElement('div');
    row.classList.add('closed-tabs__row', 'closed-tabs__row--favorite');
    row.title = t('favorites.rowTooltip', { url: favorite.url });
    row.addEventListener('click', event => {
      if ((event.target as HTMLElement | null)?.closest('.closed-tabs__row-actions')) return;
      this.viewModel.open(favorite.url, 'here');
      this.onFinished();
    });

    const icon = favicon(undefined);
    void FaviconsHandler.handleIconDownloadAndCache(favorite.url)
      .then(src => { if (src) icon.src = src; });

    const text = document.createElement('button');
    text.type = 'button';
    text.classList.add('closed-tabs__text');
    const title = document.createElement('span');
    title.classList.add('closed-tabs__row-title');
    title.textContent = favorite.title;
    const place = document.createElement('span');
    place.classList.add('closed-tabs__meta');
    place.textContent = favorite.place;
    text.append(title, place);

    const buttons = document.createElement('div');
    buttons.classList.add('closed-tabs__row-actions');
    buttons.append(
      rowButton(ICON.OPEN_GROUPED, 'open-in-new-tab', t('favorites.openInNewTab'),
        () => this.viewModel.open(favorite.url, 'newTab')),
      favoriteToggle(true, on => { if (!on) void this.viewModel.unmark(favorite.id); }));

    row.append(icon, text, buttons);
    return row;
  }
}
