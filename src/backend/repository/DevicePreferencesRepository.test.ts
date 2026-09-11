import { beforeEach, describe, expect, it } from "vitest";

import {
    applyScaleTo, DEFAULT_SCALE, DevicePreferencesRepository,
    MAX_SCALE, MIN_SCALE, normalizeScale, SCALE_STEP
} from "./DevicePreferencesRepository";
import { DEVICE_PREFERENCES_KEY } from "../datasource/chromeStorage/storageKeys";
import { readFakeStorage, seedFakeStorage } from "../../test/chromeStorageStub";

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
