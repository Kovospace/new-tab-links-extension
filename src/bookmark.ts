import { appStateRepository } from "./backend/repository/AppStateRepository";
import { profileRepository } from "./backend/repository/ProfileRepository";
import { appStateInit } from "./backend/datasource/init/AppStateInit";

import { BookmarkViewModel } from "./viewModel/bookmarkViewModel";
import { BookmarkDialog } from "./ui/partials/bookmarkDialog";
import { ChoiceDialog } from "./ui/partials/choiceDialog";
import { readBookmarkRequest } from "./utils/bookmarkRequest";

/**
 *  CSS files
 */

import './ui/styles/__variables.css'

import './ui/styles/reset.css'
import './ui/styles/main.css'

import './ui/styles/_inputDialog.css'
import './ui/styles/_bookmarkDialog.css'

/**
 *  The window that keeps the page the user is looking at.
 *
 *  It is a second entry point rather than a mode of the new tab page: the keyboard shortcut is
 *  pressed on some other site, and the service worker that catches it has no DOM to draw a
 *  form in. So the worker opens this page in a small window and hands over the tab's details
 *  in the address; everything below is the same repository layer the new tab page uses.
 *
 *  What it deliberately does not start is synchronisation. This window lives for a few seconds
 *  and holds no session or baseline of its own; the link it stores moves the profile on in
 *  storage, and the next new tab page to synchronise computes that difference against the
 *  account and pushes it - exactly as it would for anything created while offline. An open new
 *  tab page hears about the write immediately, because the repository watches storage for
 *  writes made in another page.
 */
(async () => {

    const request = readBookmarkRequest(window.location.search);

    if (!request) {
        // Nothing bookmarkable in the address; the page was opened by hand or by an old link.
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
        await new ChoiceDialog<'ok'>(
            "Nowhere to put it",
            "This profile has no group to keep a link in yet. Open a new tab, make a workspace "
            + "and a group, and the shortcut will have somewhere to save to.",
            [{ label: "Close", value: 'ok' }]
        ).ask();
        window.close();
        return;
    }

    await new BookmarkDialog(request, viewModel).show();
    window.close();

})();
