import { beforeEach, describe, expect, it } from "vitest";

import {
    applyScaleTo, DEFAULT_CLOSED_TABS_OPEN_DELAY, DEFAULT_SCALE, DevicePreferencesRepository,
    MAX_CLOSED_TABS_OPEN_DELAY, MAX_SCALE, MIN_CLOSED_TABS_OPEN_DELAY, MIN_SCALE,
    normalizeClosedTabsOpenDelay, normalizeScale, SCALE_STEP
} from "../../../src/backend/repository/DevicePreferencesRepository";
import { DEVICE_PREFERENCES_KEY } from "../../../src/backend/datasource/chromeStorage/storageKeys";
import { readFakeStorage, seedFakeStorage } from "../../support/chromeStorageStub";

/**
 *  The size the whole interface is drawn at, which is why the clamping matters more than it
 *  looks: this number becomes the root font size, and everything in this extension is sized
 *  in em. A bad one does not make part of the page wrong, it makes the page unreadable - and
 *  the control for fixing it is on that same page.
 */
describe("normalizeScale", () => {

    it("keeps a size that is already one of the steps", () => {
        expect(normalizeScale(1)).toBe(1);
        expect(normalizeScale(1.25)).toBe(1.25);
    });

    it("snaps to the nearest step", () => {
        expect(normalizeScale(1.2)).toBe(1.1875);
        expect(normalizeScale(1.26)).toBe(1.25);
    });

    it("refuses to go outside what is on offer", () => {
        expect(normalizeScale(0)).toBe(MIN_SCALE);
        expect(normalizeScale(-5)).toBe(MIN_SCALE);
        expect(normalizeScale(99)).toBe(MAX_SCALE);
    });

    it("answers the ordinary size for a value that is not a number at all", () => {
        // Storage can hold anything: an older version, a hand-edited value, a partial write.
        // Neither of these is a size to be clamped towards - they are not sizes.
        expect(normalizeScale(Number.NaN)).toBe(DEFAULT_SCALE);
        expect(normalizeScale(Number.POSITIVE_INFINITY)).toBe(DEFAULT_SCALE);
        expect(normalizeScale(Number.NEGATIVE_INFINITY)).toBe(DEFAULT_SCALE);
    });

    it("gives back an exact multiple of the step", () => {
        // What reaches the stylesheet and the slider's own value has to be one of the steps,
        // or the slider sits between two of them. It holds today because a sixteenth is exact
        // in binary; it would not for a step of a tenth, and this is what would say so.
        for (let value = MIN_SCALE - 0.3; value <= MAX_SCALE + 0.3; value += 0.017) {
            const steps = normalizeScale(value) / SCALE_STEP;
            expect(Math.abs(steps - Math.round(steps))).toBeLessThan(1e-9);
        }
    });
});

describe("DevicePreferencesRepository", () => {

    let preferences: DevicePreferencesRepository;

    beforeEach(async () => {
        preferences = new DevicePreferencesRepository();
        await preferences.init();
    });

    it("starts at the browser's own size", () => {
        expect(preferences.getScale()).toBe(DEFAULT_SCALE);
    });

    it("remembers a size", async () => {
        await preferences.setScale(1.25);

        expect(preferences.getScale()).toBe(1.25);
        expect(readFakeStorage<{ scale: number }>(DEVICE_PREFERENCES_KEY)?.scale).toBe(1.25);
    });

    it("reads back what a previous session stored", async () => {
        seedFakeStorage(DEVICE_PREFERENCES_KEY, { scale: 0.75 });

        const reopened = new DevicePreferencesRepository();
        await reopened.init();

        expect(reopened.getScale()).toBe(0.75);
    });

    it("mends a stored size that is out of range", async () => {
        seedFakeStorage(DEVICE_PREFERENCES_KEY, { scale: 42 });

        const reopened = new DevicePreferencesRepository();
        await reopened.init();

        expect(reopened.getScale()).toBe(MAX_SCALE);
    });

    it("publishes a change, so an open page can redraw", async () => {
        const seen: number[] = [];
        preferences.preferences$.subscribe(value => seen.push(value.scale));

        await preferences.setScale(1.25);

        expect(seen).toEqual([DEFAULT_SCALE, 1.25]);
    });

    it("says nothing when the size did not move", async () => {
        await preferences.setScale(1.25);

        let published = 0;
        preferences.preferences$.subscribe(() => published++);
        const before = published;

        // The slider sends one of these for every pixel it is dragged over, and the value
        // snaps - so the same size arrives again and again on the way past a step.
        await preferences.setScale(1.25);

        expect(published).toBe(before);
    });

    it("puts the size on the root element, where everything else is relative to it", () => {
        const root = document.createElement("html");

        applyScaleTo(root, 1.25);

        expect(root.style.fontSize).toBe("1.25em");
    });
});

describe("DevicePreferencesRepository, the search engine", () => {

    let preferences: DevicePreferencesRepository;

    beforeEach(async () => {
        preferences = new DevicePreferencesRepository();
        await preferences.init();
    });

    it("starts with the browser's own engine, as the store requires", () => {
        expect(preferences.getSearchEngine()).toBe("browser");
    });

    it("remembers an engine, for the next page to read", async () => {
        await preferences.setSearchEngine("duckduckgo");

        const reopened = new DevicePreferencesRepository();
        await reopened.init();

        expect(reopened.getSearchEngine()).toBe("duckduckgo");
    });

    /**
     *  Every preference is stored in one record, so each setter writes all of them. One that
     *  wrote only its own field would reset the others to their defaults on the next load.
     */
    it("keeps the engine when another preference changes", async () => {
        await preferences.setSearchEngine("bing");
        await preferences.setScale(1.25);

        const reopened = new DevicePreferencesRepository();
        await reopened.init();

        expect(reopened.getSearchEngine()).toBe("bing");
        expect(reopened.getScale()).toBe(1.25);
    });

    /** A record stored before the search bar existed has no engine in it at all. */
    it("reads a record from before the search bar as the browser's own engine", async () => {
        seedFakeStorage(DEVICE_PREFERENCES_KEY, { scale: 0.75 });

        const reopened = new DevicePreferencesRepository();
        await reopened.init();

        expect(reopened.getSearchEngine()).toBe("browser");
    });

    it("refuses an engine it does not offer", async () => {
        await preferences.setSearchEngine("bing");
        await preferences.setSearchEngine("altavista");

        expect(preferences.getSearchEngine()).toBe("browser");
    });

    it("publishes a change, so the search bar can redraw", async () => {
        const seen: string[] = [];
        preferences.preferences$.subscribe(value => seen.push(value.searchEngine));

        await preferences.setSearchEngine("duckduckgo");

        expect(seen[seen.length - 1]).toBe("duckduckgo");
    });
});

/**
 *  How long the closed-tabs rail waits for the pointer before it opens. Clamped like the size,
 *  because storage the slider never wrote can say anything.
 */
describe("DevicePreferencesRepository, the closed-tabs opening delay", () => {

    it("waits 300 ms on a device nobody has set it on", async () => {
        const preferences = new DevicePreferencesRepository();
        await preferences.init();

        expect(preferences.getClosedTabsOpenDelay()).toBe(DEFAULT_CLOSED_TABS_OPEN_DELAY);
        expect(DEFAULT_CLOSED_TABS_OPEN_DELAY).toBe(300);
    });

    it("remembers a delay and reads it back in the next session", async () => {
        const preferences = new DevicePreferencesRepository();
        await preferences.init();
        await preferences.setClosedTabsOpenDelay(1200);

        const reopened = new DevicePreferencesRepository();
        await reopened.init();

        expect(reopened.getClosedTabsOpenDelay()).toBe(1200);
    });

    it("snaps to the step and clamps to the range", () => {
        expect(normalizeClosedTabsOpenDelay(740)).toBe(700);
        expect(normalizeClosedTabsOpenDelay(-50)).toBe(MIN_CLOSED_TABS_OPEN_DELAY);
        expect(normalizeClosedTabsOpenDelay(99999)).toBe(MAX_CLOSED_TABS_OPEN_DELAY);
        expect(normalizeClosedTabsOpenDelay(Number.NaN)).toBe(DEFAULT_CLOSED_TABS_OPEN_DELAY);
    });

    it("reads a stored value it does not understand as the default", async () => {
        seedFakeStorage(DEVICE_PREFERENCES_KEY, { closedTabsOpenDelay: "soon" });

        const preferences = new DevicePreferencesRepository();
        await preferences.init();

        expect(preferences.getClosedTabsOpenDelay()).toBe(DEFAULT_CLOSED_TABS_OPEN_DELAY);
    });
});

describe("DevicePreferencesRepository, the side panel's card", () => {

    it("starts on the closed tabs, which is what the panel showed before it had two cards", async () => {
        const preferences = new DevicePreferencesRepository();
        await preferences.init();

        expect(preferences.getSidePanelCard()).toBe("closed");
    });

    it("remembers the card chosen, for the next page to open on", async () => {
        const preferences = new DevicePreferencesRepository();
        await preferences.init();
        await preferences.setSidePanelCard("open");

        const reopened = new DevicePreferencesRepository();
        await reopened.init();
        expect(reopened.getSidePanelCard()).toBe("open");
    });

    it("reads a card this version does not know as the closed tabs", async () => {
        seedFakeStorage(DEVICE_PREFERENCES_KEY, { sidePanelCard: "bookmarks" });
        const preferences = new DevicePreferencesRepository();
        await preferences.init();

        expect(preferences.getSidePanelCard()).toBe("closed");
    });
});
