import { beforeEach, describe, expect, it } from "vitest";

import { AppStateRepository } from "../../src/backend/repository/AppStateRepository";
import { ProfileRepository } from "../../src/backend/repository/ProfileRepository";
import {
    ClosedTabsRepository, recordClosedTab, writeClosedTabs
} from "../../src/backend/repository/ClosedTabsRepository";
import { MAX_CLOSED_TABS } from "../../src/backend/entity/ClosedTabEntity";
import { appStateInit } from "../../src/backend/datasource/init/AppStateInit";
import { ClosedTabsViewModel, describeAge } from "../../src/viewModel/closedTabsViewModel";
import { environment, group, link, profileOf } from "../support/profileDataFixtures";
import { flushStorageNotifications } from "../support/chromeStorageStub";
import { resolveDeviceName } from "../../src/backend/sync/DeviceName";
import { installationIdentity } from "../../src/backend/sync/InstallationIdentity";

const ENV = "0199aaaa-0000-7000-8000-00000000e001";
const GROUP = "0199aaaa-0000-7000-8000-00000000g001";

describe("ClosedTabsViewModel", () => {

    let profiles: ProfileRepository;
    let appState: AppStateRepository;
    let panel: ClosedTabsViewModel;

    beforeEach(async () => {
        profiles = new ProfileRepository();
        await profiles.init();

        appState = new AppStateRepository();
        await appState.init(appStateInit, profiles.getActiveProfileId());
        await appState.replaceCurrentProfileData(profileOf({
            environments: [environment(ENV, "Work")],
            groups: [group(GROUP, "Reading", ENV)],
            links: [link("lnk", "Kept", "https://kept.test/page", GROUP, ENV)],
            activeEnvironmentId: ENV
        }));

        await recordClosedTab(profiles.getActiveProfileId(), {
            url: "https://example.com/one", title: "One", closedAt: Date.now() - 120_000
        });

        panel = new ClosedTabsViewModel(new ClosedTabsRepository(), appState);
        await panel.initialize();
    });

    const rows = () => panel.observables.tabs.get();

    it("lists what was closed, newest first", async () => {
        await recordClosedTab(profiles.getActiveProfileId(), {
            url: "https://example.com/two", title: "Two", closedAt: Date.now()
        });
        await flushStorageNotifications();

        expect(rows().map(row => row.title)).toEqual(["Two", "One"]);
    });

    it("marks a closed tab this profile already keeps as a link", async () => {
        // The green folder of TODOS.md: the tab was still closed, and knowing it is already
        // saved is the useful half of seeing it in the list.
        await recordClosedTab(profiles.getActiveProfileId(), {
            url: "https://kept.test/page", title: "Kept", closedAt: Date.now()
        });
        await flushStorageNotifications();

        expect(rows().find(row => row.title === "Kept")?.bookmarked).toBe(true);
        expect(rows().find(row => row.title === "One")?.bookmarked).toBe(false);
    });

    it("recognises a kept address reached the other way round", async () => {
        // Compared the way the tab catcher compares them - a trailing slash is not another
        // page, and a list that missed that would show a green folder on half the rows.
        await recordClosedTab(profiles.getActiveProfileId(), {
            url: "https://kept.test/page/", title: "Kept with a slash", closedAt: Date.now()
        });
        await flushStorageNotifications();

        expect(rows().find(row => row.title === "Kept with a slash")?.bookmarked).toBe(true);
    });

    it("notices a link added after the panel was drawn", async () => {
        expect(rows().find(row => row.title === "One")?.bookmarked).toBe(false);

        await appState.createLink("https://example.com/one", "One", GROUP);

        expect(rows().find(row => row.title === "One")?.bookmarked).toBe(true);
    });

    it("names the device when the tab was closed on another one", async () => {
        await recordClosedTab(profiles.getActiveProfileId(), {
            url: "https://example.com/laptop", title: "On the laptop",
            closedAt: Date.now(), deviceName: "Laptop"
        });
        await flushStorageNotifications();

        expect(rows().find(row => row.title === "On the laptop")?.elsewhere).toBe("Laptop");
    });

    it("says nothing about a tab closed on this one", async () => {
        // This is the comparison the whole row hangs on, and it only works because the label
        // the worker stamps and the label the panel compares against are the same function.
        // An installation nobody has named still has a label - otherwise every row would be
        // stamped with nothing, and nothing is indistinguishable from "closed here".
        const here = resolveDeviceName(installationIdentity.getName());

        await recordClosedTab(profiles.getActiveProfileId(), {
            url: "https://example.com/here", title: "Closed here",
            closedAt: Date.now(), deviceName: here
        });
        await flushStorageNotifications();

        expect(here).toBeTruthy();
        expect(rows().find(row => row.title === "Closed here")?.elsewhere).toBeNull();
    });

    it("says nothing about a row recorded before devices were stamped at all", async () => {
        expect(rows().find(row => row.title === "One")?.elsewhere).toBeNull();
    });

    it("falls back to the address for a page that never said what it was", async () => {
        await recordClosedTab(profiles.getActiveProfileId(), {
            url: "https://example.com/untitled", title: "", closedAt: Date.now()
        });
        await flushStorageNotifications();

        expect(rows().map(row => row.title)).toContain("https://example.com/untitled");
    });

    it("shows one row for a page two devices closed, the newer one", async () => {
        // The account holds both - it cannot refuse them, and this device must not trim what
        // it stores or it would report the difference on every synchronisation. So the panel
        // is where the second one stops being shown.
        const profileId = profiles.getActiveProfileId();
        await writeClosedTabs(profileId, {
            "from-laptop": {
                id: "from-laptop", url: "https://example.com/page", title: "From the laptop",
                closedAt: 1000
            },
            "from-desktop": {
                id: "from-desktop", url: "https://example.com/page", title: "From the desktop",
                closedAt: 2000
            }
        });
        await flushStorageNotifications();

        expect(rows().map(row => row.title)).toEqual(["From the desktop"]);
    });

    it("shows no more than the list is meant to hold", async () => {
        // An account two devices have been filling can hold more than one device keeps.
        const profileId = profiles.getActiveProfileId();
        await writeClosedTabs(profileId, Object.fromEntries(
            Array.from({ length: MAX_CLOSED_TABS + 20 }, (_, index) => [`tab-${index}`, {
                id: `tab-${index}`, url: `https://example.com/${index}`,
                title: `Page ${index}`, closedAt: index
            }])));
        await flushStorageNotifications();

        expect(rows()).toHaveLength(MAX_CLOSED_TABS);
    });

    it("forgets one entry", async () => {
        await panel.forget(rows()[0].id);

        expect(rows()).toEqual([]);
    });
});

/**
 *  The one piece of arithmetic in the panel, and the one that reads wrong in a way nobody
 *  notices until it is on screen: "1 hours ago", or a minute that never becomes an hour.
 */
describe("describeAge", () => {

    it("says just now for anything under a minute", () => {
        expect(describeAge(0)).toBe("just now");
        expect(describeAge(59_000)).toBe("just now");
    });

    it("counts minutes up to the hour", () => {
        expect(describeAge(60_000)).toBe("1 min ago");
        expect(describeAge(59 * 60_000)).toBe("59 min ago");
    });

    it("says an hour rather than 1 hours", () => {
        expect(describeAge(60 * 60_000)).toBe("an hour ago");
        expect(describeAge(2 * 60 * 60_000)).toBe("2 hours ago");
    });

    it("turns into days, and yesterday is not 1 days", () => {
        expect(describeAge(24 * 60 * 60_000)).toBe("yesterday");
        expect(describeAge(3 * 24 * 60 * 60_000)).toBe("3 days ago");
    });
});

/**
 *  Switching profiles does not reload the page - the state is swapped in place - and each
 *  profile keeps its own closed tabs. A panel that did not notice went on showing the list of
 *  whichever profile was open when the tab was opened, and forgetting an entry from it wrote
 *  to that profile rather than to the one on screen.
 */
describe("ClosedTabsViewModel, switching profiles", () => {
    it("follows the profile that is now loaded", async () => {
        const profiles = new ProfileRepository();
        await profiles.init();
        const appState = new AppStateRepository();
        await appState.init(appStateInit, profiles.getActiveProfileId());

        await recordClosedTab(profiles.getActiveProfileId(), { url: "https://work.test/", title: "Work", closedAt: 1000 });
        const other = "0199bbbb-0000-7000-8000-00000000p002";
        await profiles.upsertProfile({ id: other, name: "Home", createdAt: 0 });
        await recordClosedTab(other, { url: "https://home.test/", title: "Home", closedAt: 2000 });

        const panel = new ClosedTabsViewModel(new ClosedTabsRepository(), appState);
        await panel.initialize();
        expect(panel.observables.tabs.get().map(t => t.title)).toEqual(["Work"]);

        await profiles.setActiveProfile(other);
        await appState.switchProfile(other);
        await flushStorageNotifications();
        await new Promise(r => setTimeout(r, 0));

        expect(panel.observables.tabs.get().map(t => t.title)).toEqual(["Home"]);
    });
});
