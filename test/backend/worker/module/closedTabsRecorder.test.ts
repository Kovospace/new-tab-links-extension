import { beforeEach, describe, expect, it } from "vitest";

import { ProfileRepository } from "../../../../src/backend/repository/ProfileRepository";
import { readClosedTabs } from "../../../../src/backend/repository/ClosedTabsRepository";
import { registerClosedTabsRecorder } from "../../../../src/backend/worker/module/closedTabsRecorder";

type UpdatedListener = (tabId: number, changeInfo: object, tab: chrome.tabs.Tab) => void;
type RemovedListener = (tabId: number) => void;

/**
 *  The recorder answers to a profile setting it reads from storage on every event - the worker
 *  holds nothing between them. Off, it records nothing and keeps no mirror of the open tabs,
 *  so that turning it back on does not record the closing of tabs opened while it was off.
 */
describe("closedTabsRecorder", () => {

    let profiles: ProfileRepository;
    let updated: UpdatedListener;
    let removed: RemovedListener;

    beforeEach(async () => {
        const tabs = chrome.tabs as unknown as Record<string, unknown>;
        tabs.onUpdated = { addListener: (listener: UpdatedListener) => { updated = listener; } };
        tabs.onRemoved = { addListener: (listener: RemovedListener) => { removed = listener; } };
        registerClosedTabsRecorder();

        profiles = new ProfileRepository();
        await profiles.init();
    });

    /** Lets the listeners' fire-and-forget storage work finish. */
    const settle = () => new Promise(resolve => setTimeout(resolve, 0));

    async function openThenClose(tabId: number, url: string): Promise<void> {
        updated(tabId, { url }, { id: tabId, url, title: url } as chrome.tabs.Tab);
        await settle();
        removed(tabId);
        await settle();
    }

    const recorded = async () =>
        Object.values(await readClosedTabs(profiles.getActiveProfileId())).map(tab => tab.url);

    it("records a closed tab while the profile records them", async () => {
        await openThenClose(1, "https://example.com/on");

        expect(await recorded()).toEqual(["https://example.com/on"]);
    });

    it("records nothing while the profile does not", async () => {
        await profiles.updateSettings({ recordClosedTabs: false });

        await openThenClose(1, "https://example.com/off");

        expect(await recorded()).toEqual([]);
    });

    it("does not record a tab opened while it was off and closed after it was turned on", async () => {
        await profiles.updateSettings({ recordClosedTabs: false });
        updated(1, { url: "https://example.com/opened-while-off" },
            { id: 1, url: "https://example.com/opened-while-off", title: "" } as chrome.tabs.Tab);
        await settle();

        await profiles.updateSettings({ recordClosedTabs: true });
        removed(1);
        await settle();

        expect(await recorded()).toEqual([]);
    });

    it("forgets the tabs it was keeping track of when recording is turned off", async () => {
        // Seen while on, then any update while off - the mirror goes, so closing it later,
        // after recording is back on, records nothing that happened in the meantime.
        updated(1, { url: "https://example.com/before" },
            { id: 1, url: "https://example.com/before", title: "" } as chrome.tabs.Tab);
        await settle();
        await profiles.updateSettings({ recordClosedTabs: false });
        updated(2, { url: "https://example.com/other" },
            { id: 2, url: "https://example.com/other", title: "" } as chrome.tabs.Tab);
        await settle();

        await profiles.updateSettings({ recordClosedTabs: true });
        removed(1);
        await settle();

        expect(await recorded()).toEqual([]);
    });
});
