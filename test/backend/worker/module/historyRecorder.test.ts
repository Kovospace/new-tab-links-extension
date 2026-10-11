import { beforeEach, describe, expect, it } from "vitest";

import { ProfileRepository } from "../../../../src/backend/repository/ProfileRepository";
import { readVisits } from "../../../../src/backend/repository/VisitsRepository";
import {
    isVisitWorthRecording, registerHistoryRecorder
} from "../../../../src/backend/worker/module/historyRecorder";

type UpdatedListener = (tabId: number, changeInfo: object, tab: chrome.tabs.Tab) => void;

const loaded = (url: string, title = "Page") =>
    ({ id: 1, url, title, status: "complete" } as chrome.tabs.Tab);

/**
 *  The recorder writes a visit when a page has finished loading, and only while the profile
 *  has asked for its history to be kept - which by default it has not.
 */
describe("historyRecorder", () => {

    let profiles: ProfileRepository;
    let updated: UpdatedListener;

    beforeEach(async () => {
        const tabs = chrome.tabs as unknown as Record<string, unknown>;
        tabs.onUpdated = { addListener: (listener: UpdatedListener) => { updated = listener; } };
        registerHistoryRecorder();

        profiles = new ProfileRepository();
        await profiles.init();
    });

    const settle = () => new Promise(resolve => setTimeout(resolve, 0));
    const recorded = async () =>
        Object.values(await readVisits(profiles.getActiveProfileId())).map(visit => visit.url);

    it("records nothing by default", async () => {
        updated(1, { status: "complete" }, loaded("https://example.com/"));
        await settle();

        expect(await recorded()).toEqual([]);
    });

    it("records a finished page once the profile keeps its history", async () => {
        await profiles.updateSettings({ recordBrowsingHistory: true });

        updated(1, { status: "complete" }, loaded("https://example.com/"));
        await settle();

        expect(await recorded()).toEqual(["https://example.com/"]);
    });

    it("waits for a page to finish, and leaves out what cannot be kept as a link", () => {
        expect(isVisitWorthRecording({ url: "https://example.com/" },
            { ...loaded("https://example.com/"), status: "loading" })).toBe(false);
        expect(isVisitWorthRecording({ status: "complete" }, loaded("chrome://newtab/"))).toBe(false);
        expect(isVisitWorthRecording({ title: "Later title" }, loaded("https://example.com/"))).toBe(true);
        expect(isVisitWorthRecording({ audible: true }, loaded("https://example.com/"))).toBe(false);
    });
});
