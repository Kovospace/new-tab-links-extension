import { beforeEach, describe, expect, it } from "vitest";

import { AppStateRepository } from "../backend/repository/AppStateRepository";
import { ProfileRepository } from "../backend/repository/ProfileRepository";
import { ClosedTabsRepository, recordClosedTab } from "../backend/repository/ClosedTabsRepository";
import { appStateInit } from "../backend/datasource/init/AppStateInit";
import { ClosedTabsViewModel, describeAge } from "./closedTabsViewModel";
import { environment, group, link, profileOf } from "../test/profileDataFixtures";
import { flushStorageNotifications } from "../test/chromeStorageStub";

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

    it("names the device only when it was another one", async () => {
        // This installation has no name in these tests, so anything with a name is elsewhere.
        await recordClosedTab(profiles.getActiveProfileId(), {
            url: "https://example.com/laptop", title: "On the laptop",
            closedAt: Date.now(), deviceName: "Laptop"
        });
        await flushStorageNotifications();

        expect(rows().find(row => row.title === "On the laptop")?.elsewhere).toBe("Laptop");
        expect(rows().find(row => row.title === "One")?.elsewhere).toBeNull();
    });

    it("falls back to the address for a page that never said what it was", async () => {
        await recordClosedTab(profiles.getActiveProfileId(), {
            url: "https://example.com/untitled", title: "", closedAt: Date.now()
        });
        await flushStorageNotifications();

        expect(rows().map(row => row.title)).toContain("https://example.com/untitled");
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
