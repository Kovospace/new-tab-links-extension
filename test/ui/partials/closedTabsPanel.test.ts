import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { AppStateRepository } from "../../../src/backend/repository/AppStateRepository";
import { ProfileRepository } from "../../../src/backend/repository/ProfileRepository";
import { ClosedTabsRepository, recordClosedTab } from "../../../src/backend/repository/ClosedTabsRepository";
import { appStateInit } from "../../../src/backend/datasource/init/AppStateInit";
import { ClosedTabsViewModel } from "../../../src/viewModel/closedTabsViewModel";
import { PageOpener } from "../../../src/utils/pageOpener";
import { HistoryViewModel } from "../../../src/viewModel/historyViewModel";
import { VisitsRepository } from "../../../src/backend/repository/VisitsRepository";
import { CardPreference, ClosedTabsPanel, KeepOpenPreference } from "../../../src/ui/partials/closedTabsPanel";
import { ObservableValue } from "../../../src/utils/observableValue";
import { OpenTabsViewModel, TabsSource } from "../../../src/viewModel/openTabsViewModel";
import { SidePanelCard } from "../../../src/backend/repository/DevicePreferencesRepository";
import { DEFAULT_CLOSED_TABS_OPEN_DELAY as OPEN_DELAY_MS } from "../../../src/backend/repository/DevicePreferencesRepository";
import { environment, group, profileOf } from "../../support/profileDataFixtures";
import { flushStorageNotifications } from "../../support/chromeStorageStub";

/** Records where the panel opened a page; jsdom cannot navigate. Reset before every test. */
const opener = { here: vi.fn(), newTab: vi.fn() } satisfies PageOpener;
beforeEach(() => { opener.here.mockReset(); opener.newTab.mockReset(); });

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
        document.body.innerHTML = '<main></main>';
        profiles = new ProfileRepository();
        await profiles.init();
        appState = new AppStateRepository();
        await appState.init(appStateInit, profiles.getActiveProfileId());
        await appState.replaceCurrentProfileData(profileOf({
            environments: [environment("e", "W")], groups: [group("g", "R", "e")], activeEnvironmentId: "e"
        }));
        await recordClosedTab(profiles.getActiveProfileId(), { url: "https://example.com/x", title: "Page", closedAt: Date.now() });
        panel = new ClosedTabsPanel(new ClosedTabsViewModel(new ClosedTabsRepository(), appState, profiles, opener),
            undefined, undefined, undefined, new HistoryViewModel(new VisitsRepository(), appState, profiles, undefined, opener));
        await panel.render(document.body);
        await flushStorageNotifications();
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    });

    afterEach(() => {
        panel.dispose();
        vi.useRealTimers();
    });

    it("says recording is off instead of listing anything, and comes back when it is on", async () => {
        const aside = () => document.querySelector(".closed-tabs")!;

        await profiles.updateSettings({ recordClosedTabs: false });
        expect(aside().classList.contains("closed-tabs--off")).toBe(true);
        expect(aside().querySelector(".closed-tabs__off-action")).not.toBeNull();

        await profiles.updateSettings({ recordClosedTabs: true });
        expect(aside().classList.contains("closed-tabs--off")).toBe(false);
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
            new ClosedTabsViewModel(new ClosedTabsRepository(), appState, profiles, opener), () => delay,
            undefined, undefined, new HistoryViewModel(new VisitsRepository(), appState, profiles, undefined, opener));
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

    describe("when closing takes a click (this device's setting)", () => {
        let closeOnClick = true;

        beforeEach(async () => {
            closeOnClick = true;
            panel.dispose();
            document.body.innerHTML = '<main></main>';
            panel = new ClosedTabsPanel(
                new ClosedTabsViewModel(new ClosedTabsRepository(), appState, profiles, opener), undefined,
                undefined, undefined, new HistoryViewModel(new VisitsRepository(), appState, profiles, undefined, opener),
                undefined, () => closeOnClick);
            await panel.render(document.body);
        });

        /** Rests the pointer on the rail until the panel opens, then the edge is the open one. */
        function openByPointer() {
            edgeAt(960);
            pass(970);
            vi.advanceTimersByTime(OPEN_DELAY_MS);
            expect(isOpen()).toBe(true);
            edgeAt(600);
        }

        it("stays open when the pointer moves away", () => {
            openByPointer();

            move(400);

            expect(isOpen()).toBe(true);
        });

        it("ignores a click inside it and closes on one outside", () => {
            openByPointer();
            move(400);

            document.querySelector('.closed-tabs__list')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            expect(isOpen()).toBe(true);

            document.querySelector('main')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            expect(isOpen()).toBe(false);
        });

        it("closes when a row in it is opened", () => {
            (globalThis as unknown as { chrome: { tabs: { create: unknown } } })
                .chrome.tabs.create = vi.fn();
            openByPointer();
            move(400);
            expect(isOpen()).toBe(true);

            (document.querySelector('.closed-tabs__text') as HTMLButtonElement).click();

            expect(isOpen()).toBe(false);
        });

        it("reads the setting each time the panel opens", () => {
            openByPointer();
            document.querySelector('main')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            expect(isOpen()).toBe(false);

            closeOnClick = false;              // unticked in Settings meanwhile
            openByPointer();
            move(400);

            expect(isOpen()).toBe(false);
        });
    });

    it("opens for a pointer flung out of the page through the edge beside it", () => {
        // The bug: in a maximised window the screen's last pixels are the window's frame. A
        // fast pointer's last mousemove was left of the rail and its next position outside
        // the page, so the rail never heard from it - no row even lit up - and stayed shut.
        edgeAt(960);
        pass(400);

        document.dispatchEvent(new MouseEvent('mouseout',
            { clientX: window.innerWidth + 3, clientY: 300, relatedTarget: null, bubbles: true }));
        vi.advanceTimersByTime(OPEN_DELAY_MS);

        expect(isOpen()).toBe(true);
    });

    it("stays shut for a pointer that leaves the page through the top", () => {
        edgeAt(960);

        document.dispatchEvent(new MouseEvent('mouseout',
            { clientX: 980, clientY: -5, relatedTarget: null, bubbles: true }));
        vi.advanceTimersByTime(OPEN_DELAY_MS);

        expect(isOpen()).toBe(false);
    });

    it("ignores the pointer moving between elements of the page", () => {
        edgeAt(960);

        document.querySelector('main')!.dispatchEvent(new MouseEvent('mouseout',
            { clientX: 980, clientY: 300, relatedTarget: document.body, bubbles: true }));
        vi.advanceTimersByTime(OPEN_DELAY_MS);

        expect(isOpen()).toBe(false);
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
        (document.querySelector('.closed-tabs__favicon') as HTMLElement).click();

        expect(opener.here).toHaveBeenCalledWith("https://example.com/x");
    });

    it("opens a clicked row in this tab, as a link on the page opens", () => {
        (document.querySelector('.closed-tabs__text') as HTMLButtonElement).click();

        expect(opener.here).toHaveBeenCalledWith("https://example.com/x");
        expect(opener.newTab).not.toHaveBeenCalled();
    });

    it("opens the page in a new tab from the row's last button, where the pointer is left", () => {
        // Last on purpose: the panel widens leftwards from the rail, so the pointer that
        // opened it stands at the right-hand end of a row.
        const buttons = document.querySelector('.closed-tabs__row-actions')!.querySelectorAll('button');
        const last = buttons[buttons.length - 1] as HTMLButtonElement;
        expect(last.classList.contains('open-in-new-tab')).toBe(true);

        last.click();

        expect(opener.newTab).toHaveBeenCalledWith("https://example.com/x");
        expect(opener.here).not.toHaveBeenCalled();
    });

    it("does not reopen the tab when its delete button is pressed", () => {
        (document.querySelector('.closed-tabs__row-action.danger') as HTMLButtonElement).click();

        expect(opener.here).not.toHaveBeenCalled();
        expect(opener.newTab).not.toHaveBeenCalled();
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

        (document.querySelector('.closed-tabs__row-action.danger') as HTMLButtonElement).click();

        expect(panel.isPinned()).toBe(true);
        expect(isOpen()).toBe(true);
    });
});

/**
 *  The panel holds two cards, one shown at a time: the tabs open in this browser, and the
 *  recently closed ones. Which one is shown is remembered per device; what each card's rows do
 *  is the card's own.
 */
describe("ClosedTabsPanel, cards", () => {
    let panel: ClosedTabsPanel;
    let remembered: SidePanelCard;
    let activated: number[];
    let closed: number[];
    let profiles: ProfileRepository;

    beforeEach(async () => {
        document.body.innerHTML = '<main></main>';
        profiles = new ProfileRepository();
        await profiles.init();
        const appState = new AppStateRepository();
        await appState.init(appStateInit, profiles.getActiveProfileId());
        await recordClosedTab(profiles.getActiveProfileId(),
            { url: "https://example.com/closed", title: "Closed one", closedAt: Date.now() });

        activated = [];
        closed = [];
        const tabs: TabsSource = {
            query: async () => [{ id: 41, windowId: 1, index: 0,
                url: "https://example.com/open", title: "Open one" } as chrome.tabs.Tab],
            currentWindowId: async () => 1,
            activate: async tab => { activated.push(tab.id); },
            close: async id => { closed.push(id); },
            onChanged: () => () => undefined
        };
        remembered = "closed";
        const preference: CardPreference = {
            get: () => remembered,
            set: async card => { remembered = card; }
        };

        panel = new ClosedTabsPanel(
            new ClosedTabsViewModel(new ClosedTabsRepository(), appState, profiles, opener),
            () => 0, new OpenTabsViewModel(appState, tabs), preference,
            new HistoryViewModel(new VisitsRepository(), appState, profiles, undefined, opener));
        await panel.render(document.body);
        await flushStorageNotifications();
    });

    afterEach(() => panel.dispose());

    const aside = () => document.querySelector('.closed-tabs') as HTMLElement;
    const cardButton = (index: number) =>
        document.querySelectorAll('.closed-tabs__card')[index] as HTMLButtonElement;
    const openRow = () =>
        document.querySelector('.closed-tabs__list--open .closed-tabs__row') as HTMLElement;

    it("opens on the card this device chose last, and remembers a new choice", () => {
        expect(aside().dataset.card).toBe("closed");
        expect(document.querySelector('.closed-tabs__title')!.textContent).toBe("Recently closed");

        cardButton(0).click();

        expect(aside().dataset.card).toBe("open");
        expect(document.querySelector('.closed-tabs__title')!.textContent).toBe("Open tabs");
        expect(cardButton(0).getAttribute('aria-pressed')).toBe("true");
        expect(cardButton(1).getAttribute('aria-pressed')).toBe("false");
        expect(remembered).toBe("open");
    });

    it("draws the open tabs in their own list, apart from the closed ones", () => {
        expect(openRow().textContent).toContain("Open one");
        expect(document.querySelector('.closed-tabs__list--closed')!.textContent)
            .toContain("Closed one");
    });

    it("switches to an open tab when its row is clicked", () => {
        openRow().click();

        expect(activated).toEqual([41]);
    });

    it("offers the history as a third card, saying it is off until it is turned on", async () => {
        cardButton(2).click();

        expect(aside().dataset.card).toBe("history");
        expect(remembered).toBe("history");
        expect(document.querySelector('.closed-tabs__title')!.textContent).toBe("History");
        expect(aside().classList.contains("closed-tabs--history-off")).toBe(true);

        await profiles.updateSettings({ recordBrowsingHistory: true });
        expect(aside().classList.contains("closed-tabs--history-off")).toBe(false);
    });

    it("closes the tab, and only closes it, from the row's x", () => {
        const buttons = openRow().querySelectorAll('.closed-tabs__row-action');
        (buttons[buttons.length - 1] as HTMLButtonElement).click();

        expect(closed).toEqual([41]);
        expect(activated).toEqual([]);
    });
});

/**
 *  "Keep open": a lasting state of this device rather than one errand's pin. Nothing folds a
 *  panel kept open - not the pointer, not a click elsewhere, not opening a row - except the
 *  button that closes it, which unticks it.
 */
describe("ClosedTabsPanel, kept open", () => {
    let appState: AppStateRepository;
    let panel: ClosedTabsPanel;
    let profiles: ProfileRepository;
    let kept: ObservableValue<boolean>;

    const preference: KeepOpenPreference = {
        set: async keep => kept.set(keep),
        follow: listener => kept.subscribe(listener)
    };
    const checkbox = () => document.querySelector('.closed-tabs__keep-open > input') as HTMLInputElement;

    async function renderWith(keepOpen: boolean): Promise<void> {
        kept = new ObservableValue<boolean>(keepOpen);
        panel = new ClosedTabsPanel(new ClosedTabsViewModel(new ClosedTabsRepository(), appState, profiles, opener),
            () => 0, undefined, undefined, new HistoryViewModel(new VisitsRepository(), appState, profiles, undefined, opener),
            preference);
        await panel.render(document.body);
        await flushStorageNotifications();
        edgeAt(600);
    }

    beforeEach(async () => {
        document.body.innerHTML = '<main></main>';
        profiles = new ProfileRepository();
        await profiles.init();
        appState = new AppStateRepository();
        await appState.init(appStateInit, profiles.getActiveProfileId());
        await appState.replaceCurrentProfileData(profileOf({
            environments: [environment("e", "W")], groups: [group("g", "R", "e")], activeEnvironmentId: "e"
        }));
        await recordClosedTab(profiles.getActiveProfileId(), { url: "https://example.com/x", title: "Page", closedAt: Date.now() });
    });

    afterEach(() => panel.dispose());

    it("opens on a new tab already open and ticked", async () => {
        await renderWith(true);

        expect(isOpen()).toBe(true);
        expect(checkbox().checked).toBe(true);
        expect(panel.isPinned()).toBe(true);
    });

    it("is folded by nothing: not the pointer, a click elsewhere, or opening a row", async () => {
        (globalThis as unknown as { chrome: { tabs: { create: unknown } } })
            .chrome.tabs.create = vi.fn();
        await renderWith(true);

        pass(100);
        document.querySelector('main')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        (document.querySelector('.closed-tabs__text') as HTMLButtonElement).click();

        expect(isOpen()).toBe(true);
    });

    it("is kept open from its checkbox, and handed back to the pointer when unticked", async () => {
        await renderWith(false);
        expect(isOpen()).toBe(false);

        checkbox().checked = true;
        checkbox().dispatchEvent(new Event('change'));
        expect(kept.get()).toBe(true);
        expect(isOpen()).toBe(true);

        checkbox().checked = false;
        checkbox().dispatchEvent(new Event('change'));
        expect(kept.get()).toBe(false);
        expect(isOpen()).toBe(true);      // the pointer is on the checkbox, inside the panel

        pass(100);
        expect(isOpen()).toBe(false);
    });

    it("follows a change made in Settings or another page", async () => {
        await renderWith(false);

        kept.set(true);

        expect(isOpen()).toBe(true);
        expect(checkbox().checked).toBe(true);
    });

    it("closes from its own close button, and that unticks it", async () => {
        await renderWith(true);

        panel.togglePinned();

        expect(isOpen()).toBe(false);
        expect(kept.get()).toBe(false);
        expect(checkbox().checked).toBe(false);
        expect(panel.isPinned()).toBe(false);
    });
});
