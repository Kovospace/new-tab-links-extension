import { beforeEach, describe, expect, it } from "vitest";

import { AppStateRepository } from "../../src/backend/repository/AppStateRepository";
import { ProfileRepository } from "../../src/backend/repository/ProfileRepository";
import { VisitsRepository, writeVisits } from "../../src/backend/repository/VisitsRepository";
import { appStateInit } from "../../src/backend/datasource/init/AppStateInit";
import { HistoryViewModel } from "../../src/viewModel/historyViewModel";
import { setDateFormat } from "../../src/i18n/dates";
import { environment, group, link, profileOf } from "../support/profileDataFixtures";
import { flushStorageNotifications } from "../support/chromeStorageStub";

const ENV = "0199aaaa-0000-7000-8000-00000000e001";
const GROUP = "0199aaaa-0000-7000-8000-00000000g001";

/** Local moments, so "today" means the same thing in any time zone the tests run in. */
const at = (day: number, hour: number) => new Date(2026, 9, day, hour, 0).getTime();
const NOW = at(11, 18);

/**
 *  The history card groups the visits by the day they happened on, newest first, marks what is
 *  already kept, and draws one row per page per day even when two devices both recorded it.
 */
describe("HistoryViewModel", () => {

    let profiles: ProfileRepository;
    let appState: AppStateRepository;
    let history: HistoryViewModel;

    beforeEach(async () => {
        setDateFormat("isoDashes");
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

        await writeVisits(profiles.getActiveProfileId(), {
            a: { id: "a", url: "https://example.com/today", title: "Today's", visitedAt: at(11, 9) },
            b: { id: "b", url: "https://kept.test/page/", title: "Kept", visitedAt: at(10, 20) },
            c: { id: "c", url: "https://example.com/old", title: "Old", visitedAt: at(3, 8),
                deviceName: "Laptop" },
            // The same page the same day from another device: drawn once, the newer.
            d: { id: "d", url: "https://example.com/today", title: "Today's", visitedAt: at(11, 7),
                deviceName: "Laptop" }
        });

        history = new HistoryViewModel(new VisitsRepository(), appState, profiles, () => NOW);
        await history.initialize();
    });

    const days = () => history.observables.days.get();

    it("groups by day, newest first, and names today and yesterday", () => {
        expect(days().map(day => day.label)).toEqual(["Today", "Yesterday", "2026-10-03"]);
        expect(days().map(day => day.visits.map(visit => visit.id))).toEqual([["a"], ["b"], ["c"]]);
    });

    it("marks what the profile already keeps and names another device", () => {
        expect(days()[1].visits[0].bookmarked).toBe(true);
        expect(days()[2].visits[0].elsewhere).toBe("Laptop");
        expect(days()[0].visits[0].elsewhere).toBeNull();
    });

    it("says when, with the time alone for today and the date for earlier", () => {
        // The clock is written the way the region writes it, which here is the test runner's.
        expect(days()[0].visits[0].when).toMatch(/^9 hours ago \((09:00|9:00\sAM)\)$/);
        expect(days()[2].visits[0].when).toMatch(/^8 days ago \(2026-10-03 (08:00|8:00\sAM)\)$/);
    });

    it("follows whether the profile records history, which it does not by default", async () => {
        expect(history.observables.recording.get()).toBe(false);

        await profiles.updateSettings({ recordBrowsingHistory: true });

        expect(history.observables.recording.get()).toBe(true);
    });

    it("forgets one entry and the lot", async () => {
        await history.forget("c");
        await flushStorageNotifications();
        expect(days().flatMap(day => day.visits).map(visit => visit.id)).toEqual(["a", "b"]);

        await history.forgetAll();
        expect(days()).toEqual([]);
    });
});
