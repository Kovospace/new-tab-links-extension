import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { AppStateRepository } from "../../../src/backend/repository/AppStateRepository";
import { ProfileRepository } from "../../../src/backend/repository/ProfileRepository";
import { ClosedTabsRepository, recordClosedTab } from "../../../src/backend/repository/ClosedTabsRepository";
import { appStateInit } from "../../../src/backend/datasource/init/AppStateInit";
import { ClosedTabsViewModel } from "../../../src/viewModel/closedTabsViewModel";
import { ClosedTabsPanel } from "../../../src/ui/partials/closedTabsPanel";
import { DEFAULT_CLOSED_TABS_OPEN_DELAY as OPEN_DELAY_MS } from "../../../src/backend/repository/DevicePreferencesRepository";
import { environment, group, profileOf } from "../../support/profileDataFixtures";
import { flushStorageNotifications } from "../../support/chromeStorageStub";

/**
 *  jsdom lays nothing out, so the panel is told where it is: a column down the right, starting
 *  below the header and ending above the footer. Those edges are exactly what the rule reads.
 */
const HEADER_BOTTOM = 60;
const FOOTER_TOP = 700;

function edgeAt(x: number) {
    const panel = document.querySelector('.closed-tabs') as HTMLElement;
    panel.getBoundingClientRect = () => ({
        left: x, right: 1000, top: HEADER_BOTTOM, bottom: FOOTER_TOP,
        width: 1000 - x, height: FOOTER_TOP - HEADER_BOTTOM, x, y: HEADER_BOTTOM,
        toJSON: () => ({})
    }) as DOMRect;
}

/** A pointer somewhere on the page; beside the panel unless a test says otherwise. */
const pass = (x: number, y: number = 300) =>
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true }));
/** A pointer that comes to rest there - long enough for the panel to act on it. */
const move = (x: number, y: number = 300) => {
    pass(x, y);
    vi.advanceTimersByTime(OPEN_DELAY_MS);
};
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
    let profiles: ProfileRepository;

    beforeEach(async () => {
        document.body.innerHTML = '<div class="overlay hidden"></div><main></main><button class="action-closed-tabs"></button>';
        profiles = new ProfileRepository();
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

    it("waits for the pointer to stay before opening", () => {
        // The bug: on the way to the settings button the pointer crossed the rail, and the
        // panel opened underneath it.
        edgeAt(960);

        pass(970);
        vi.advanceTimersByTime(OPEN_DELAY_MS - 1);
        expect(isOpen()).toBe(false);

        vi.advanceTimersByTime(1);
        expect(isOpen()).toBe(true);
    });

    it("waits as long as this device's setting says, read when the pointer arrives", () => {
        let delay = 1000;
        panel.dispose();
        document.body.innerHTML = '<main></main>';
        panel = new ClosedTabsPanel(
            new ClosedTabsViewModel(new ClosedTabsRepository(), appState), () => delay);
        void panel.render(document.body);
        edgeAt(960);

        pass(970);
        vi.advanceTimersByTime(OPEN_DELAY_MS);
        expect(isOpen()).toBe(false);
        vi.advanceTimersByTime(1000 - OPEN_DELAY_MS);
        expect(isOpen()).toBe(true);

        pass(400);
        delay = 0;                                 // changed in the settings meanwhile
        pass(970);
        expect(isOpen()).toBe(true);
    });

    it("stays shut for a pointer that only passes over the rail", () => {
        edgeAt(960);

        pass(970);
        vi.advanceTimersByTime(OPEN_DELAY_MS / 2);
        expect(isOpen()).toBe(false);
        pass(980, HEADER_BOTTOM - 20);             // on up to the settings button
        vi.advanceTimersByTime(OPEN_DELAY_MS);

        expect(isOpen()).toBe(false);
    });

    it("does not restart the wait while the pointer moves within the rail", () => {
        edgeAt(960);

        pass(970);
        vi.advanceTimersByTime(OPEN_DELAY_MS / 2);
        pass(975, 320);
        vi.advanceTimersByTime(OPEN_DELAY_MS / 2);

        expect(isOpen()).toBe(true);
    });

    it("stays shut for a pointer that is merely far enough right", () => {
        // The bug: the rail is a column of the grid and starts below the header, so "right of
        // its left edge" is true of the application menu and the settings button in the
        // corner too. Reaching for those opened the panel underneath them.
        edgeAt(960);

        move(980, HEADER_BOTTOM - 20);

        expect(isOpen()).toBe(false);
    });

    it("closes when the pointer leaves upwards, towards those buttons", () => {
        edgeAt(960);
        move(980);
        expect(isOpen()).toBe(true);

        edgeAt(600);
        move(980, HEADER_BOTTOM - 20);

        expect(isOpen()).toBe(false);
    });

    it("stays shut for a pointer below it, over the footer", () => {
        edgeAt(960);

        move(980, FOOTER_TOP + 20);

        expect(isOpen()).toBe(false);
    });

    it("does not flap when the pointer sits where the open edge was", () => {
        edgeAt(960); move(970); expect(isOpen()).toBe(true);
        edgeAt(600); move(500); expect(isOpen()).toBe(false);
        edgeAt(960); move(500);                       // collapsed edge is right of the pointer
        expect(isOpen()).toBe(false);
    });

    it("publishes being pinned, so the button can show it", () => {
        // The button cannot just listen to its own clicks: the panel lets go of itself when
        // something outside it is clicked, and a button that never heard about that would go
        // on looking pressed.
        const seen: boolean[] = [];
        panel.pinned$.subscribe(pinned => seen.push(pinned));

        panel.togglePinned();
        document.querySelector('main')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(seen).toEqual([false, true, false]);
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

    it("reopens the tab from its favicon, which is all the folded rail shows", () => {
        // The bug: only the row's text reopened it, and folded the text is not drawn - so the
        // rail was a column of icons that did nothing when clicked.
        const reopen = vi.fn();
        (globalThis as unknown as { chrome: { tabs: { create: unknown } } })
            .chrome.tabs.create = reopen;

        (document.querySelector('.closed-tabs__favicon') as HTMLElement).click();

        expect(reopen).toHaveBeenCalledWith(expect.objectContaining({ url: "https://example.com/x" }));
    });

    it("does not reopen the tab when one of its own buttons is pressed", () => {
        const reopen = vi.fn();
        (globalThis as unknown as { chrome: { tabs: { create: unknown } } })
            .chrome.tabs.create = reopen;

        const buttons = document.querySelector('.closed-tabs__row')!.querySelectorAll('button');
        (buttons[buttons.length - 1] as HTMLButtonElement).click();

        expect(reopen).not.toHaveBeenCalled();
    });

    it("puts the device on a line of its own, and only when it was another one", async () => {
        // Two facts on one line means the second is the one that gets ellipsised away, and in
        // a rail this narrow that is always the one that was added last.
        await recordClosedTab(profiles.getActiveProfileId(), {
            url: "https://example.com/laptop", title: "From the laptop",
            closedAt: Date.now(), deviceName: "Laptop"
        });
        await flushStorageNotifications();

        const devices = Array.from(document.querySelectorAll('.closed-tabs__device'))
            .map(element => element.textContent);
        expect(devices).toEqual(["Laptop"]);
        // The row closed here has a time and no device line at all.
        expect(document.querySelectorAll('.closed-tabs__meta').length)
            .toBeGreaterThan(devices.length);
    });

    it("lets go of the focus as it folds, so no row stays lit", () => {
        // The bug: a row's "+" and "x" are revealed by :focus-within as well as by :hover,
        // and the row's title is a button - so dragging a row out of the panel left it
        // focused. Its actions stayed lit over the folded rail, came back lit the next time
        // the panel opened with the pointer nowhere near them, and only went out when
        // something else was clicked, which is what blurred it.
        edgeAt(960);
        move(970);
        const text = document.querySelector('.closed-tabs__text') as HTMLButtonElement;
        text.focus();
        expect(document.activeElement).toBe(text);

        move(400);                                    // away to the left; the panel folds

        expect(isOpen()).toBe(false);
        expect(document.querySelector('.closed-tabs')!.contains(document.activeElement))
            .toBe(false);
    });

    it("keeps the focus while the panel is held open by the button", () => {
        // Pinned is the panel being used, and somebody working through it by keyboard is
        // exactly who the focus rule is for.
        panel.togglePinned();
        const text = document.querySelector('.closed-tabs__text') as HTMLButtonElement;
        text.focus();

        edgeAt(600);
        move(10);

        expect(document.activeElement).toBe(text);
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
