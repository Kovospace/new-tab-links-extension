/**
 *  Where this extension keeps things in chrome.storage.local.
 *
 *  Shared rather than declared next to each repository, because the background service
 *  worker reads the same two keys without going through them: it has no page, no
 *  ObservableValue and no profile registry of its own, only the storage the page wrote.
 */

/** The profile registry: which profiles exist and which one is loaded. */
export const PROFILE_REGISTRY_KEY = "profile_registry";

/** Prefix of the key holding one profile's data; the profile identifier completes it. */
export const APP_STATE_PREFIX = "app_state_";

/** The key one profile's data is stored under. */
export function appStateKey(profileId: string): string {
    return APP_STATE_PREFIX + profileId;
}
