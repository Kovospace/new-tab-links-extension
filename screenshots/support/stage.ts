import type { Page } from "@playwright/test";

/** Every picture is taken at this moment, so "2 hours ago" reads the same on every run. */
const FIXED_TIME = new Date("2026-10-27T10:00:00");

/**
 *  Device preferences a scene may set - the stored shape of `DevicePreferences`
 *  (`backend/repository/DevicePreferencesRepository.ts`). Anything left out reads as the
 *  default, so a scene names only what it changes.
 */
export interface StagePreferences {
    theme?: "auto" | "light" | "dark";
    themeStyle?: "aero" | "flat";
    scale?: number;
    sidePanelCard?: "open" | "closed" | "history";
    keepSidePanelOpen?: boolean;
    [other: string]: unknown;
}

/**
 *  Makes what changes between runs hold still: the clock, and the tip on the workspace, which
 *  is chosen with Math.random - always the first one instead. Before the first navigation, so
 *  the page never sees the real ones.
 */
export async function holdStill(page: Page): Promise<void> {
    await page.clock.setFixedTime(FIXED_TIME);
    await page.addInitScript(() => { Math.random = () => 0; });
}

/**
 *  Pages really visited before the pictures are taken, so the history and the closed tabs
 *  are recorded by the worker itself - real titles, real favicons. Per language, where the
 *  site has one.
 */
const VISITED_PAGES: Record<string, string[]> = {
    en: [
        "https://en.wikipedia.org/wiki/Web_browser",
        "https://github.com/",
        "https://developer.mozilla.org/en-US/",
        "https://www.openstreetmap.org/",
    ],
    sk: [
        "https://sk.wikipedia.org/wiki/Webov%C3%BD_prehliada%C4%8D",
        "https://github.com/",
        // MDN has no Slovak edition; its address for one is a "Page not found".
        "https://developer.mozilla.org/en-US/",
        "https://www.openstreetmap.org/",
    ],
};

/**
 *  What another device of the same account recorded - made up, since there is no second
 *  device: it is what makes a row say where it happened. A device name is the user's own
 *  label, so it is written in the reader's language.
 */
const OTHER_DEVICE: Record<string, string> = { en: "Work computer", sk: "Pracovný počítač" };
const OTHER_DEVICE_PAGES = [
    {
        url: "https://stackoverflow.com/questions/927358/how-do-i-undo-the-most-recent-local-commits-in-git",
        title: "How do I undo the most recent local commits in Git? - Stack Overflow",
        // Through Google: Stack Overflow's own hosts refuse headless Chromium.
        faviconUrl: "https://www.google.com/s2/favicons?domain=stackoverflow.com&sz=64",
        minutesAgo: 18,
    },
    {
        url: "https://mail.google.com/mail/u/0/",
        title: "Gmail",
        faviconUrl: "https://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico",
        minutesAgo: 47,
    },
];

/** The pages visited here are spread out this far apart before `FIXED_TIME`, newest first. */
const LOCAL_MINUTES_AGO = [4, 11, 26, 39];

/**
 *  Opens the new tab page with the language and preferences in place and the "Load examples"
 *  set loaded - the way a new user reaches it, through the first-run page's button. The
 *  preferences are written first, so the page the button reloads is already drawn with them.
 *  Then the examples are made to look used - see `stageDemoData`.
 */
export async function openWithExamples(
    page: Page,
    extensionId: string,
    language: string,
    preferences: StagePreferences
): Promise<void> {
    await page.goto(`chrome-extension://${extensionId}/index.html`);
    // Synchronisation off: the premium session below must never reach for the account.
    await page.evaluate(
        stored => chrome.storage.local.set({ device_preferences: stored }),
        { ...preferences, language, syncEnabled: false });
    await page.reload();
    await Promise.all([
        page.waitForEvent("load"),
        page.click("#act-load-defaults"),
    ]);
    await page.waitForSelector("workspace-plane link-group");
    await stageDemoData(page, language);
}

/**
 *  Turns freshly loaded examples into a profile somebody uses:
 *
 *  - **No longer example data.** The first edit clears the example mark on the workspace and
 *    the profile, and with it the "this is only an example" notice; this clears it the same way.
 *  - **History and closed tabs.** History recording is turned on, a few pages are really
 *    visited and closed, and two pages "closed on the work computer" are added beside them.
 *  - **Premium**, so there is no ad slot: tabilinks.app is not blocked (the background pictures
 *    come from there), so a free page would load the slot. A stored session with a premium
 *    standing checked "now" does it; synchronisation is off, so nothing asks the account.
 *
 *  Reloads the page at the end, so it is drawn from the staged storage.
 */
async function stageDemoData(page: Page, language: string): Promise<void> {
    await page.evaluate(async now => {
        const { profile_registry: registry } = await chrome.storage.local.get("profile_registry");
        const profileId: string = registry.activeProfileId;
        const { example: _example, ...profile } = registry.profiles[profileId];
        profile.settings = { ...profile.settings, recordBrowsingHistory: true };
        registry.profiles[profileId] = profile;

        const stateKey = `app_state_${profileId}`;
        const { [stateKey]: state } = await chrome.storage.local.get(stateKey);
        for (const workspace of Object.values<Record<string, unknown>>(state.environments)) {
            delete workspace.example;
        }

        await chrome.storage.local.set({
            profile_registry: registry,
            [stateKey]: state,
            sync_session: {
                accessToken: "screenshots", refreshToken: "screenshots",
                userId: "screenshots", username: "tabilinks", deviceId: null,
                accessTokenExpiresAt: now + 365 * 24 * 60 * 60 * 1000,
            },
            account_standing: { userId: "screenshots", premium: true, checkedAt: now },
        });
    }, FIXED_TIME.getTime());

    await visitAndClose(page, VISITED_PAGES[language] ?? VISITED_PAGES.en);
    await placeLogsInTime(page, OTHER_DEVICE[language] ?? OTHER_DEVICE.en);
    await page.reload();
    await page.waitForSelector("workspace-plane link-group");
}

/**
 *  Opens each page in a tab of its own and closes it again - the worker records the visit
 *  once the page has loaded and the closed tab when it goes. Waits until both are stored.
 */
async function visitAndClose(page: Page, urls: string[]): Promise<void> {
    for (const url of urls) {
        const tab = await page.context().newPage();
        await tab.goto(url, { waitUntil: "load" });
        // Title and favicon arrive in reports after "complete"; let the worker hear them.
        await tab.waitForTimeout(1500);
        await tab.close();
    }
    // Polled from here: waitForFunction takes the promise an async check returns for a yes.
    const deadline = Date.now() + 30_000;
    while (Math.min(...Object.values(await countLogs(page))) < urls.length) {
        if (Date.now() > deadline) {
            throw new Error(`Visited ${urls.length} pages, recorded ${JSON.stringify(await countLogs(page))}`);
        }
        await page.waitForTimeout(250);
    }
}

/** How many closed tabs and visits the active profile has stored. */
function countLogs(page: Page): Promise<{ closedTabs: number; visits: number }> {
    return page.evaluate(async () => {
        const { profile_registry: registry } = await chrome.storage.local.get("profile_registry");
        const id = registry.activeProfileId;
        const stored = await chrome.storage.local.get([`closed_tabs_${id}`, `visits_${id}`]);
        return {
            closedTabs: Object.keys(stored[`closed_tabs_${id}`] ?? {}).length,
            visits: Object.keys(stored[`visits_${id}`] ?? {}).length,
        };
    });
}

/**
 *  Moves what was recorded to just before `FIXED_TIME`, and adds the other device's two pages.
 *
 *  The worker's clock is the real one - only the page's is held still - so what it recorded
 *  would read as "in 20 hours" on a page frozen in the past. Kept in the order it happened.
 */
async function placeLogsInTime(page: Page, otherDevice: string): Promise<void> {
    await page.evaluate(async ({ now, localMinutesAgo, otherDevice, otherPages }) => {
        const minute = 60 * 1000;
        const { profile_registry: registry } = await chrome.storage.local.get("profile_registry");
        const id = registry.activeProfileId;
        const closedKey = `closed_tabs_${id}`;
        const visitsKey = `visits_${id}`;
        const stored = await chrome.storage.local.get([closedKey, visitsKey]);

        // Both logs are stored as records keyed by their id.
        type Entry = Record<string, unknown> & { id: string };
        const restamped = (entries: Record<string, Entry>, field: string): Record<string, Entry> => {
            const local = Object.values(entries)
                .sort((one, other) => (other[field] as number) - (one[field] as number))
                .map((entry, index) => ({
                    ...entry,
                    [field]: now - (localMinutesAgo[index] ?? localMinutesAgo.length * 15 + index) * minute,
                }));
            const fromOther: Entry[] = otherPages.map(other => ({
                id: crypto.randomUUID(), url: other.url, title: other.title,
                faviconUrl: other.faviconUrl, deviceName: otherDevice,
                [field]: now - other.minutesAgo * minute,
            }));
            return Object.fromEntries([...local, ...fromOther].map(entry => [entry.id, entry]));
        };

        await chrome.storage.local.set({
            [closedKey]: restamped(stored[closedKey] ?? {}, "closedAt"),
            [visitsKey]: restamped(stored[visitsKey] ?? {}, "visitedAt"),
        });
    }, { now: FIXED_TIME.getTime(), localMinutesAgo: LOCAL_MINUTES_AGO, otherDevice, otherPages: OTHER_DEVICE_PAGES });
}

/**
 *  Waits until the page has stopped changing: favicons arrive from the worker one by one, and
 *  the network falling quiet is not the same as them being drawn.
 */
export async function settle(page: Page): Promise<void> {
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);
}
