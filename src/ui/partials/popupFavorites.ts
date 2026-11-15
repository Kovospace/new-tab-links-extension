import { t } from '../../i18n/i18n';
import { FavoriteDTO } from '../../viewModel/favorites';
import { FaviconsHandler } from '../backgroundWorkerCommands/faviconsHandler';

/**
 * The open workspace's favorites under the bookmarking form in the toolbar popup (#183): one
 * click away from any page, which is what a favorite is for. A row opens its link in a new tab,
 * because the tab behind the popup is a page the user is still on, and closes the popup.
 * Nothing is drawn when there are none.
 *
 * @param favorites what to list, in the order the page draws them
 * @param open      opens an address in a new tab
 */
export function renderPopupFavorites(favorites: FavoriteDTO[], open: (url: string) => void): HTMLElement | null {
  if (favorites.length === 0) return null;

  const section = document.createElement('section');
  section.classList.add('popup-favorites');

  const heading = document.createElement('h2');
  heading.classList.add('input-dialog__title', 'popup-favorites__title');
  heading.textContent = t('favorites.title');

  const list = document.createElement('ul');
  list.classList.add('popup-favorites__list');
  for (const favorite of favorites) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.classList.add('popup-favorites__row');
    button.title = favorite.url;

    const icon = document.createElement('img');
    icon.width = 16;
    icon.height = 16;
    icon.alt = '';
    icon.src = '/gfx/favicon-default.svg';
    void FaviconsHandler.handleIconDownloadAndCache(favorite.url)
      .then(src => { if (src) icon.src = src; });

    const title = document.createElement('span');
    title.classList.add('popup-favorites__name');
    title.textContent = favorite.title;
    const place = document.createElement('span');
    place.classList.add('popup-favorites__place');
    place.textContent = favorite.place;

    button.append(icon, title, place);
    button.addEventListener('click', () => open(favorite.url));
    item.appendChild(button);
    list.appendChild(item);
  }
  section.append(heading, list);
  return section;
}
