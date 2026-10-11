import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppStateRepository } from "../../src/backend/repository/AppStateRepository";
import { ProfileRepository } from "../../src/backend/repository/ProfileRepository";
import { appStateInit } from "../../src/backend/datasource/init/AppStateInit";
import { OpenTabsViewModel, TabsSource } from "../../src/viewModel/openTabsViewModel";
import { environment, group, link, profileOf } from "../support/profileDataFixtures";

const ENV = "0199aaaa-0000-7000-8000-00000000e001";
const GROUP = "0199aaaa-0000-7000-8000-00000000g001";

/** A tab as the browser would report it, with only what the card reads. */
function tab(id: number, windowId: number, index: number, url: string, title = ""): chrome.tabs.Tab {
    return { id, windowId, index, url, title } as chrome.tabs.Tab;
}

/** The browser's tabs, held in a list a test can change and announce. */
class FakeTabs implements TabsSource {
    public open: chrome.tabs.Tab[] = [];
    public current: number | null = 1;
    public activated: Array<{ id: number; windowId: number }> = [];
    public closed: number[] = [];
    private listener: (() => void) | null = null;

    query = async () => this.open;
    currentWindowId = async () => this.current;
    activate = async (target: { id: number; windowId: number }) => { this.activated.push(target); };
    close = async (id: number) => { this.closed.push(id); };
    onChanged = (callback: () => void) => {
        this.listener = callback;
        return () => { this.listener = null; };
    };

    /** What a tab event does: says something may have changed, nothing more. */
    announce(): void {
        this.listener?.();
    }
}

/**
 *  The open tabs card lists this browser's tabs the way its tab strip does, marks the ones the
 *  profile already keeps, and follows the browser as tabs come and go. Nothing is stored.
 */
describe("OpenTabsViewModel", () => {

    let appState: AppStateRepository;
    let tabs: FakeTabs;
    let card: OpenTabsViewModel;

    beforeEach(async () => {
        const profiles = new ProfileRepository();
        await profiles.init();

        appState = new AppStateRepository();
        await appState.init(appStateInit, profiles.getActiveProfileId());
        await appState.replaceCurrentProfileData(profileOf({
            environments: [environment(ENV, "Work")],
            groups: [group(GROUP, "Reading", ENV)],
            links: [link("lnk", "Kept", "https://kept.test/page", GROUP, ENV)],
            activeEnvironmentId: ENV
        }));

        tabs = new FakeTabs();
    });

    afterEach(() => {
        card?.dispose();
        vi.useRealTimers();
    });

    async function showing(): Promise<OpenTabsViewModel> {
        card = new OpenTabsViewModel(appState, tabs);
        await card.initialize();
        return card;
    }

    const windows = () => card.observables.windows.get();

    it("lists one window's tabs in tab strip order, without a heading", async () => {
        tabs.open = [
            tab(12, 1, 1, "https://example.com/second", "Second"),
            tab(11, 1, 0, "https://example.com/first", "First")
        ];
        await showing();

        expect(windows()).toHaveLength(1);
        expect(windows()[0].label).toBeNull();
        expect(windows()[0].tabs.map(row => row.title)).toEqual(["First", "Second"]);
    });

    it("leaves out what could not be kept as a link - this new tab page included", async () => {
        tabs.open = [
            tab(1, 1, 0, "chrome://newtab/"),
            tab(2, 1, 1, "chrome-extension://abc/index.html"),
            tab(3, 1, 2, "https://example.com/", "Page")
        ];
        await showing();

        expect(windows()[0].tabs.map(row => row.id)).toEqual([3]);
    });

    it("puts this window first and names every window when there are several", async () => {
        tabs.current = 7;
        tabs.open = [
            tab(1, 3, 0, "https://example.com/elsewhere"),
            tab(2, 7, 0, "https://example.com/here"),
            tab(3, 9, 0, "https://example.com/third")
        ];
        await showing();

        expect(windows().map(window => window.label))
            .toEqual(["This window", "Window 2", "Window 3"]);
        expect(windows()[0].tabs[0].url).toBe("https://example.com/here");
    });

    it("marks a tab whose address the profile already keeps", async () => {
        tabs.open = [
            tab(1, 1, 0, "https://kept.test/page/", "Kept"),
            tab(2, 1, 1, "https://example.com/", "Not kept")
        ];
        await showing();

        expect(windows()[0].tabs.map(row => row.bookmarked)).toEqual([true, false]);
    });

    it("falls back to the address for a page that has no title yet", async () => {
        tabs.open = [tab(1, 1, 0, "https://example.com/loading")];
        await showing();

        expect(windows()[0].tabs[0].title).toBe("https://example.com/loading");
    });

    it("reads the tabs again after the browser says they changed, once for a burst", async () => {
        tabs.open = [tab(1, 1, 0, "https://example.com/one")];
        await showing();
        vi.useFakeTimers();
        const query = vi.spyOn(tabs, "query");

        tabs.open = [...tabs.open, tab(2, 1, 1, "https://example.com/two")];
        tabs.announce();
        tabs.announce();
        tabs.announce();
        await vi.runAllTimersAsync();

        expect(query).toHaveBeenCalledTimes(1);
        expect(windows()[0].tabs.map(row => row.id)).toEqual([1, 2]);
    });

    it("switches to a tab in its own window, and closes one", async () => {
        tabs.open = [tab(5, 2, 0, "https://example.com/")];
        tabs.current = 1;
        await showing();

        await card.activate(5);
        await card.close(5);

        expect(tabs.activated).toEqual([{ id: 5, windowId: 2 }]);
        expect(tabs.closed).toEqual([5]);
    });

    it("stops listening once disposed", async () => {
        await showing();
        card.dispose();
        vi.useFakeTimers();
        const query = vi.spyOn(tabs, "query");

        tabs.announce();
        await vi.runAllTimersAsync();

        expect(query).not.toHaveBeenCalled();
    });
});
