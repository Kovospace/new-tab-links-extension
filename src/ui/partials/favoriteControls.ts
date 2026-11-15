import { t } from '../../i18n/i18n';
import { FieldMap } from './inputDialog';
import { favoritesEnabled } from '../../viewModel/favorites';
import { CLASS_FAVORITE_ON, CLASS_FAVORITE_TOGGLE } from '../../constants';

/**
 * The "Favorite" checkbox of a dialog that makes a link (#183), under the key `favorite`, or
 * nothing while the profile does not use favorites. Read each time a dialog is built, so the
 * setting needs no reload.
 *
 * @param checked whether it starts ticked - a closed tab or a visit made a favorite does
 */
export function favoriteField(checked = false): FieldMap {
  return favoritesEnabled()
    ? { [t('dialogs.fields.favorite')]: { type: 'checkbox', key: 'favorite', checked } }
    : {};
}

/** What the checkbox answered, as a dialog hands it over: absent when it was not there. */
export function isFavoriteAnswer(value: string | undefined): boolean {
  return value === 'true';
}

/**
 *  The favorite circle (#183), at the end of a link and of a side panel or search row: empty with a white rim, golden when the
 *  link is a favorite. Always built - the stylesheet shows it only while the profile uses
 *  favorites (`data-favorites` on the root), so switching them on redraws nothing. A click on
 *  it is the circle's alone: it does not open the link.
 *
 *  @param favorite whether the link is one now
 *  @param toggle   what to do with the new answer
 */
export function favoriteToggle(favorite: boolean, toggle: (favorite: boolean) => void): HTMLButtonElement {
    const circle = document.createElement("button");
    circle.type = "button";
    circle.draggable = false;
    circle.classList.add(CLASS_FAVORITE_TOGGLE);
    const show = (on: boolean): void => {
        circle.classList.toggle(CLASS_FAVORITE_ON, on);
        circle.title = on ? t("link.menu.removeFavorite") : t("link.menu.addFavorite");
        circle.setAttribute("aria-pressed", String(on));
    };
    show(favorite);
    circle.addEventListener("mousedown", event => event.preventDefault());
    circle.addEventListener("click", event => {
        event.stopPropagation();
        event.preventDefault();
        // Answered at once, where a redraw would come later or - in the search list - not at
        // all. A list that is redrawn from the state draws the truth over it anyway.
        favorite = !favorite;
        show(favorite);
        toggle(favorite);
    });
    return circle;
}

