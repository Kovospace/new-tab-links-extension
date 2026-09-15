import { appStateRepository } from "./backend/repository/AppStateRepository";
import { profileRepository } from "./backend/repository/ProfileRepository";
import { devicePreferencesRepository } from "./backend/repository/DevicePreferencesRepository";
import { appStateInit } from "./backend/datasource/init/AppStateInit";

import { BookmarkViewModel } from "./viewModel/bookmarkViewModel";
import { BookmarkForm, renderNotice } from "./ui/partials/bookmarkForm";
import { requestForActiveTab, takePendingBookmark } from "./utils/bookmarkRequest";
import { t } from "./i18n/i18n";

/**
 *  CSS files
 */

import './ui/styles/__variables.css'

import './ui/styles/reset.css'
import './ui/styles/main.css'

import './ui/styles/_inputDialog.css'
import './ui/styles/_bookmarkPanel.css'

/**
 *  The popup that keeps the page the user is looking at.
 *
 *  It is the extension's action popup: the bubble the browser draws under the toolbar icon,
 *  opened by that icon, by the keyboard shortcut through `_execute_action`, and by the
 *  right-click menu through `chrome.action.openPopup()`. The browser sizes it to this
 *  document and furnishes it with nothing, which is why the form is drawn inline rather than
 *  in a dialog, and why nothing here measures anything.
 *
 *  **Where the page to bookmark comes from.** The right-click menu leaves a request in session
 *  storage, because a popup takes no argument; the toolbar icon and the shortcut leave none,
 *  and mean the tab the popup is standing on. Nothing left over can be answered late: a
 *  request is taken rather than read, and expires.
 *
 *  What it deliberately does not start is synchronisation. This popup lives for a few seconds
 *  and holds no session or baseline of its own; the link it stores moves the profile on in
 *  storage, and the next new tab page to synchronise computes that difference against the
 *  account and pushes it - exactly as it would for anything created while offline. An open new
 *  tab page hears about the write immediately, because the repository watches storage for
 *  writes made in another page.
 */
(async () => {

    // The same size the new tab page is drawn at: this window is a page of the same extension
    // and sized in the same em, and a popup half the size of everything else looks broken.
    await devicePreferencesRepository.init();
    devicePreferencesRepository.applyScale();
    devicePreferencesRepository.applyLocale();
    document.title = t("bookmark.pageTitle");

    const host = document.body.getElementsByTagName("main")[0];

    const request = await takePendingBookmark() ?? await requestForActiveTab();

    if (!request) {
        await renderNotice(
            host,
            t("bookmark.nothingToBookmark.title"),
            t("bookmark.nothingToBookmark.message"));
        window.close();
        return;
    }

    await profileRepository.init();
    await appStateRepository.init(appStateInit, profileRepository.getActiveProfileId());

    const viewModel = new BookmarkViewModel();

    if (!viewModel.canBookmark()) {
        // The first workspace and its first group are decisions made on the new tab page, and
        // creating them here - unasked, from a keyboard shortcut - would be a poor way to meet
        // the extension.
        await renderNotice(
            host,
            t("bookmark.nowhereToPut.title"),
            t("bookmark.nowhereToPut.message"));
        window.close();
        return;
    }

    await new BookmarkForm(request, viewModel).render(host);
    window.close();

})();
