import { describe, expect, it, beforeEach, vi } from "vitest";
import { AppStateRepository } from "../../backend/repository/AppStateRepository";
import { ProfileRepository } from "../../backend/repository/ProfileRepository";
import { ClosedTabsRepository, recordClosedTab } from "../../backend/repository/ClosedTabsRepository";
import { appStateInit } from "../../backend/datasource/init/AppStateInit";
import { ClosedTabsViewModel } from "../../viewModel/closedTabsViewModel";
import { ClosedTabsPanel } from "./closedTabsPanel";
import { environment, group, profileOf } from "../../test/profileDataFixtures";
import { flushStorageNotifications } from "../../test/chromeStorageStub";

/** jsdom lays nothing out, so the panel is told where it is. */
function edgeAt(x: number) {
    const panel = document.querySelector('.closed-tabs') as HTMLElement;
    panel.getBoundingClientRect = () => ({ left: x, right: 1000, top: 0, bottom: 800, width: 1000 - x, height: 800, x, y: 0, toJSON: () => ({}) }) as DOMRect;
}
const move = (x: number) => document.dispatchEvent(new MouseEvent('mousemove', { clientX: x, bubbles: true }));
const isOpen = () => document.querySelector('.closed-tabs')!.classList.contains('closed-tabs--open');

/**
 *  Where the panel opens and closes from, which is the part of it a user feels rather than
 *  sees. Two rules meet here and the order matters: the pointer decides, unless the button has
 *  taken the decision away.
 *
 *  jsdom lays nothing out - every element measures zero - so the panel is told where its edge
 *  is. That is not a weakening of the test: the edge is exactly the input the rule reads.
 */
describe("ClosedTabsPanel, opening and closing", () => {
    let appState: AppStateRepository;
    let panel: ClosedTabsPanel;

    beforeEach(async () => {
        document.body.innerHTML = '<div class="overlay hidden"></div><main></main><button class="action-closed-tabs"></button>';
        const profiles = new ProfileRepository();
        await profiles.init();
        appState = new AppStateRepository();
        await appState.init(appStateInit, profiles.getActiveProfileId());
        await appState.replaceCurrentProfileData(profileOf({
            environments: [environment("e", "W")], groups: [group("g", "R", "e")], activeEnvironmentId: "e"
        }));
        await recordClosedTab(profiles.getActiveProfileId(), { url: "https://example.com/x", title: "Page", closedAt: Date.now() });
        panel = new ClosedTabsPanel(new ClosedTabsViewModel(new ClosedTabsRepository(), appState));
        await panel.render(document.body);
        await flushStorageNotifications();
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

        document.querySelector('.action-closed-tabs')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(panel.isPinned()).toBe(true);      // the button's own business

        document.querySelector('main')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(panel.isPinned()).toBe(false);
        expect(isOpen()).toBe(false);
    });

    it("closes when a row is opened, which is the end of the errand", () => {
        (globalThis as unknown as { chrome: { tabs: { create: unknown } } })
            .chrome.tabs.create = vi.fn();
        panel.togglePinned();

        (document.querySelector('.closed-tabs__text') as HTMLButtonElement).click();

        expect(panel.isPinned()).toBe(false);
        expect(isOpen()).toBe(false);
    });

    it("stays open when a row is only deleted", () => {
        // Forgetting one entry is working through the list, not finishing with it.
        panel.togglePinned();

        const buttons = document.querySelector('.closed-tabs__row')!.querySelectorAll('button');
        (buttons[buttons.length - 1] as HTMLButtonElement).click();

        expect(panel.isPinned()).toBe(true);
        expect(isOpen()).toBe(true);
    });
});
