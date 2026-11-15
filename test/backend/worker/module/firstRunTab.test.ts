import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerFirstRunTab } from "../../../../src/backend/worker/module/firstRunTab";
import { BACKGROUND_DEFAULT_PENDING_KEY } from "../../../../src/backend/datasource/chromeStorage/storageKeys";
import { readFakeStorage } from "../../../support/chromeStorageStub";

type InstalledListener = (details: { reason: string }) => void;

/**
 *  #172: a fresh install opens the new tab page, so the first thing a new user meets is the
 *  first-run screen rather than the bookmarking popup behind the toolbar icon.
 */
describe("registerFirstRunTab", () => {

    let listeners: InstalledListener[];
    let create: ReturnType<typeof vi.fn>;
    const runtime = (globalThis as any).chrome.runtime;
    const tabs = (globalThis as any).chrome.tabs;
    let originalCreate: unknown;

    beforeEach(() => {
        listeners = [];
        runtime.onInstalled = { addListener: (listener: InstalledListener) => listeners.push(listener) };
        create = vi.fn(async () => ({}));
        originalCreate = tabs.create;
        tabs.create = create;
        registerFirstRunTab();
    });

    afterEach(() => {
        delete runtime.onInstalled;
        tabs.create = originalCreate;
    });

    it("opens a new tab when the extension is installed", async () => {
        listeners.forEach(listener => listener({ reason: "install" }));
        await vi.waitFor(() => expect(create).toHaveBeenCalledWith({}));
    });

    /** #175: asked for before the tab opens, so the page that tab draws already finds it. */
    it("asks for the default background before it opens the tab", async () => {
        let askedWhenOpened: unknown;
        create.mockImplementation(async () => { askedWhenOpened = readFakeStorage(BACKGROUND_DEFAULT_PENDING_KEY); });

        listeners.forEach(listener => listener({ reason: "install" }));

        await vi.waitFor(() => expect(create).toHaveBeenCalled());
        expect(askedWhenOpened).toBe(true);
    });

    it("opens nothing and asks for no background on an update or a browser update", async () => {
        listeners.forEach(listener => listener({ reason: "update" }));
        listeners.forEach(listener => listener({ reason: "chrome_update" }));
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(create).not.toHaveBeenCalled();
        expect(readFakeStorage(BACKGROUND_DEFAULT_PENDING_KEY)).toBeNull();
    });
});
