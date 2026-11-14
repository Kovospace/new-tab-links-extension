import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerFirstRunTab } from "../../../../src/backend/worker/module/firstRunTab";

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

    it("opens a new tab when the extension is installed", () => {
        listeners.forEach(listener => listener({ reason: "install" }));
        expect(create).toHaveBeenCalledWith({});
    });

    it("opens nothing on an update or a browser update", () => {
        listeners.forEach(listener => listener({ reason: "update" }));
        listeners.forEach(listener => listener({ reason: "chrome_update" }));
        expect(create).not.toHaveBeenCalled();
    });
});
