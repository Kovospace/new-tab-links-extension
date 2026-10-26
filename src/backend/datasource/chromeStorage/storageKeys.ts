/**
 *  Where this extension keeps things in chrome.storage.local.
 *
 *  Shared rather than declared next to each repository, because the background service
 *  worker reads the same two keys without going through them: it has no page, no
 *  ObservableValue and no profile registry of its own, only the storage the page wrote.
 */

/** The profile registry: which profiles exist and which one is loaded. */
export const PROFILE_REGISTRY_KEY = "profile_registry";

/**
 *  Where the profiles of an account other than the visible one are kept, hidden.
 *
 *  `profile_registry` is always the visible set - every reader of it, the service worker and
 *  the bookmarking popup included, sees what the page shows. When another account signs in,
 *  the visible set moves here under its owner, and comes back when that owner signs in again.
 *  Only the list moves: each profile's data stays under its own key, which is unique anyway.
 */
export const HIDDEN_PROFILE_REGISTRY_PREFIX = "profile_registry_";

export function hiddenProfileRegistryKey(accountId: string): string {
    return HIDDEN_PROFILE_REGISTRY_PREFIX + accountId;
}

/** Prefix of the key holding one profile's data; the profile identifier completes it. */
export const APP_STATE_PREFIX = "app_state_";

/** The key one profile's data is stored under. */
export function appStateKey(profileId: string): string {
    return APP_STATE_PREFIX + profileId;
}

/**
 *  The page the bookmarking popup is about to be opened for.
 *
 *  Lives in `chrome.storage.session`, not local: it is a few seconds of intent between the
 *  service worker and the popup, and must not outlive the browser session. See
 *  `utils/bookmarkRequest.ts`.
 */
export const PENDING_BOOKMARK_KEY = "pending_bookmark";

/**
 *  One profile's recently closed tabs, kept apart from that profile's data on purpose.
 *
 *  The service worker writes these, and it writes them while the page may be saving state of
 *  its own. If they lived in the profile's own record the worker would have to read, change
 *  and write back the whole of it - and a copy read a moment before the page added a link
 *  would put that link back in the bin. A key the worker owns alone cannot do that: the worst
 *  it can lose is a closed tab.
 */
export const CLOSED_TABS_PREFIX = "closed_tabs_";

/** The key one profile's closed tabs are stored under. */
export function closedTabsKey(profileId: string): string {
    return CLOSED_TABS_PREFIX + profileId;
}

/**
 *  One profile's browsing history, apart from its data for the reason closed tabs are: the
 *  worker writes it while the page may be saving.
 */
export const VISITS_PREFIX = "visits_";

/** The key one profile's browsing history is stored under. */
export function visitsKey(profileId: string): string {
    return VISITS_PREFIX + profileId;
}

/**
 *  The name the user gave this installation, read by the worker when it records a closed tab
 *  so the row can say which device it happened on. Written by `InstallationIdentity`.
 */
export const INSTALLATION_NAME_KEY = "sync_installation_name";

/**
 *  What this browser prefers, as opposed to what the profile does: the size the interface is
 *  drawn at, for now. Never synchronised - see `DevicePreferencesRepository`.
 */
export const DEVICE_PREFERENCES_KEY = "device_preferences";

/**
 *  New tabs opened and not yet reported, by local day, with when the last report was made and
 *  how long the server asked to wait before the next. Written only by the service worker, so
 *  two new tab pages opening at once cannot lose a count or send one twice.
 */
export const NEW_TAB_USAGE_KEY = "new_tab_usage";

/**
 *  Whether the signed-in account is premium, as the backend last said, and when. Kept so a
 *  premium user's new tab is drawn without an ad from the first frame instead of flashing one
 *  while the account is asked. Written by `AccountStandingRepository`.
 */
export const ACCOUNT_STANDING_KEY = "account_standing";

/**
 *  The picture behind the new tab page, as a data URL, or nothing. A key of its own rather than
 *  a field of the device preferences: it is the one thing here measured in hundreds of kilobytes,
 *  and every read of the preferences would otherwise carry it. Per device and never synchronised
 *  - see `BackgroundImageRepository`. Only the picture in use is here; the library of pictures to
 *  choose from is in IndexedDB (`BackgroundLibraryRepository`).
 */
export const BACKGROUND_IMAGE_KEY = "background_image";

/** Which tile of the background library is the picture in use - its id - or nothing. */
export const BACKGROUND_SELECTED_KEY = "background_selected";

/** The built-in pictures removed from the library on this device, by id. */
export const BACKGROUND_HIDDEN_BUILT_INS_KEY = "background_hidden_built_ins";

/**
 * What this installation last reported to the account about what it holds - the account and a
 * signature of the report - so an unchanged inventory is not sent again. See InventoryReporter.
 */
export const INVENTORY_REPORTED_KEY = "sync_inventory_reported";
