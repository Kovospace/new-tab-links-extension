import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { AppStateRepository } from "../../../src/backend/repository/AppStateRepository";
import { ProfileRepository } from "../../../src/backend/repository/ProfileRepository";
import { ClosedTabsRepository, recordClosedTab } from "../../../src/backend/repository/ClosedTabsRepository";
import { appStateInit } from "../../../src/backend/datasource/init/AppStateInit";
import { ClosedTabsViewModel } from "../../../src/viewModel/closedTabsViewModel";
import { HistoryViewModel } from "../../../src/viewModel/historyViewModel";
import { VisitsRepository } from "../../../src/backend/repository/VisitsRepository";
import { ClosedTabsPanel } from "../../../src/ui/partials/closedTabsPanel";
import { DEFAULT_CLOSED_TABS_OPEN_DELAY as OPEN_DELAY_MS } from "../../../src/backend/repository/DevicePreferencesRepository";
import { environment, group, profileOf } from "../../support/profileDataFixtures";
import { flushStorageNotifications } from "../../support/chromeStorageStub";

/** jsdom lays nothing out, so the panel is told where it is. */
function edgeAt(x: number) {
    const panel = document.querySelector('.closed-tabs') as HTMLElement;
    panel.getBoundingClientRect = () => ({ left: x, right: 1000, top: 0, bottom: 800, width: 1000 - x, height: 800, x, y: 0, toJSON: () => ({}) }) as DOMRect;
}
const move = (x: number) => {
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: x, bubbles: true }));
    vi.advanceTimersByTime(OPEN_DELAY_MS);
};
const isOpen = () => document.querySelector('.closed-tabs')!.classList.contains('closed-tabs--open');

describe("rail pointer logic", () => {
    let appState: AppStateRepository;
    let panel: ClosedTabsPanel;

    beforeEach(async () => {
        document.body.innerHTML = '<main></main>';
        const profiles = new ProfileRepository();
        await profiles.init();
        appState = new AppStateRepository();
        await appState.init(appStateInit, profiles.getActiveProfileId());
        await appState.replaceCurrentProfileData(profileOf({
            environments: [environment("e", "W")], groups: [group("g", "R", "e")], activeEnvironmentId: "e"
        }));
        await recordClosedTab(profiles.getActiveProfileId(), { url: "https://example.com/x", title: "Page", closedAt: Date.now() });
        panel = new ClosedTabsPanel(new ClosedTabsViewModel(new ClosedTabsRepository(), appState, profiles),
            undefined, undefined, undefined, new HistoryViewModel(new VisitsRepository(), appState, profiles));
        await panel.render(document.body);
        await flushStorageNotifications();
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    });

    afterEach(() => {
        panel.dispose();
        vi.useRealTimers();
    });

    it("opens over the rail, stays open to the right, closes to the left", () => {
        edgeAt(960);                 // collapsed rail starts at 960
        expect(isOpen()).toBe(false);

        move(970);                   // onto the rail
        expect(isOpen()).toBe(true);

        edgeAt(600);                 // now open, its edge is further left
        move(995);                   // out to the scrollbar area, past the panel
        expect(isOpen()).toBe(true);

        move(400);                   // away to the left, over the columns
        expect(isOpen()).toBe(false);
    });

    it("does not flap when the pointer sits where the open edge was", () => {
        edgeAt(960); move(970); expect(isOpen()).toBe(true);
        edgeAt(600); move(500); expect(isOpen()).toBe(false);
        edgeAt(960); move(500);                       // collapsed edge is right of the pointer
        expect(isOpen()).toBe(false);
    });

    it("ignores the pointer while pinned, and closes when unpinned", () => {
        panel.togglePinned();
        expect(isOpen()).toBe(true);

        edgeAt(600); move(10);
        expect(isOpen()).toBe(true);

        panel.togglePinned();
        expect(isOpen()).toBe(false);
    });

    it("closes a pinned panel on a click outside, but not on one inside", () => {
        panel.togglePinned();

        document.querySelector('.closed-tabs__list')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(panel.isPinned()).toBe(true);

        document.querySelector('main')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(panel.isPinned()).toBe(false);
        expect(isOpen()).toBe(false);
    });

    it("closes when a row is opened, but not when one is deleted", async () => {
        (globalThis as any).chrome.tabs.create = vi.fn();
        panel.togglePinned();

        const forget = document.querySelector('.closed-tabs__row')!.querySelectorAll('button');
        (forget[forget.length - 1] as HTMLButtonElement).click();
        expect(panel.isPinned()).toBe(true);

        await recordClosedTab((await new ProfileRepository().init(), "default"), { url: "https://example.com/y", title: "Y", closedAt: Date.now() });
        await flushStorageNotifications();
        (document.querySelector('.closed-tabs__text') as HTMLButtonElement).click();
        expect(panel.isPinned()).toBe(false);
        expect(isOpen()).toBe(false);
    });
});
