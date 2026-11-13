import type { Page } from "@playwright/test";
import type { Translate } from "./i18n";

/**
 *  What a scene can do on the new tab page - a "page object", Playwright's name for keeping
 *  selectors in one place. A scene says `openSettings("background")`; only this file knows
 *  that it is the application menu's last entry and a folding heading. When the markup
 *  changes, this is the one place to follow it.
 *
 *  Buttons are found by what they say, through `t`, so every method works in every language.
 */
/** An area of the window, in CSS pixels. */
export interface Box { x: number; y: number; width: number; height: number }

export class NewTabPage {

    constructor(readonly page: Page, private readonly t: Translate) {}

    /** Moves the pointer where it opens nothing: resting over the side panel's rail would open it. */
    async pointerAway(): Promise<void> {
        await this.page.mouse.move(640, 10);
    }

    /**
     *  Opens Settings from the application menu, with one category unfolded, the others
     *  folded, and that one scrolled to the top of the dialog.
     *
     *  @param category a key under `settings.categories`, e.g. "background"; the dialog as it
     *                  opens - the first category unfolded - when none is given
     */
    async openSettings(category?: string): Promise<void> {
        await this.page.click(".action-app-menu");
        await this.page.getByText(this.t("sync.menu.settings"), { exact: true }).click();
        if (!category) {
            return;
        }
        const title = this.t(`settings.categories.${category}`);
        const heads = this.page.locator(".settings-dialog__category-head");
        const wanted = heads.filter({ hasText: title });
        // A locator is a query, not an element: it is asked again every time it is used, so
        // this sees the dialog as it is after each fold - it redraws itself on every one.
        const othersOpen = heads.filter({ hasNotText: title }).and(this.page.locator("[aria-expanded=true]"));
        while (await othersOpen.count() > 0) {
            await othersOpen.first().click();
        }
        if (await wanted.getAttribute("aria-expanded") === "false") {
            await wanted.click();
        }
        await wanted.evaluate(head => head.scrollIntoView({ block: "start" }));
        // Left where the click was, the pointer now hovers a tile and draws its "x".
        await this.pointerAway();
    }

    /**
     *  Puts one of the built-in background pictures behind the page, the way a user does:
     *  Settings → Background, its tile, and Close. The full-size picture is downloaded from the
     *  website, so this waits until the page is drawn with it.
     *
     *  @param number the tile's number as Settings labels it, from 1
     */
    async chooseBackground(number: number): Promise<void> {
        await this.openSettings("background");
        await this.page.getByRole("option",
            { name: this.t("settings.backgroundImage.tile", { number: String(number) }), exact: true }).click();
        await this.page.locator("html.has-custom-background").waitFor({ state: "attached", timeout: 30_000 });
        await this.page.getByRole("button", { name: this.t("common.close"), exact: true }).click();
        await this.pointerAway();
    }

    /** The horizontal middle of the group columns, in CSS pixels - where a seam crosses them all. */
    async groupsCentre(): Promise<number> {
        return this.page.locator("workspace-plane link-group").evaluateAll(groups => {
            const boxes = groups.map(group => group.getBoundingClientRect());
            return (Math.min(...boxes.map(box => box.left)) + Math.max(...boxes.map(box => box.right))) / 2;
        });
    }

    /**
     *  Changes device preferences while the page is open - written to storage as Settings
     *  would, and followed by the page as a change from another page is.
     */
    async setPreferences(changes: Record<string, unknown>): Promise<void> {
        await this.page.evaluate(async changes => {
            const { device_preferences: stored } = await chrome.storage.local.get("device_preferences");
            await chrome.storage.local.set({ device_preferences: { ...(stored ?? {}), ...changes } });
        }, changes);
    }

    /**
     *  Rests the pointer on a tile of Settings → Background, which has to be open, so it is
     *  drawn hovered - with its "x" - and draws the pointer there.
     *
     *  @param number the tile's number as Settings labels it, from 1; the user's own pictures
     *                come first, newest first, then the built-in ones
     */
    async hoverBackgroundTile(number: number): Promise<void> {
        const tile = this.page.getByRole("option",
            { name: this.t("settings.backgroundImage.tile", { number: String(number) }), exact: true });
        const box = (await tile.boundingBox())!;
        await this.movePointerTo(box.x + box.width * 0.45, box.y + box.height * 0.6);
    }

    /**
     *  Adds a picture of the user's own to the background library, the way a user does: the
     *  "+" tile of Settings → Background, which has to be open, and a file. Adding one puts it
     *  behind the page, so this waits until the page is drawn with it. Settings stays open,
     *  scrolled back to the section's top - the user's own pictures are its first tiles, and
     *  pressing "+" at the bottom left them out of sight.
     *
     *  @param file a picture on disk
     */
    async addOwnBackground(file: string): Promise<void> {
        const add = this.page.getByRole("button", { name: this.t("settings.backgroundImage.add"), exact: true });
        const [chooser] = await Promise.all([this.page.waitForEvent("filechooser"), add.click()]);
        await chooser.setFiles(file);
        await this.page.locator(".background-library__tile--selected[style*='background-image']")
            .waitFor({ timeout: 30_000 });
        await this.page.locator("html.has-custom-background").waitFor({ state: "attached" });
        await this.page.locator(".settings-dialog__category-head")
            .filter({ hasText: this.t("settings.categories.background") })
            .evaluate(head => head.scrollIntoView({ block: "start" }));
        await this.pointerAway();
    }

    /**
     *  Opens the side panel the way a user does - the pointer rests on its rail - and waits
     *  until it has widened. Which card it shows is the `sidePanelCard` preference.
     */
    async openSidePanel(): Promise<void> {
        const viewport = this.page.viewportSize()!;
        await this.page.mouse.move(viewport.width - 10, viewport.height / 2);
        await this.page.locator(".closed-tabs.closed-tabs--open").waitFor();
        // The panel widens with a transition; a row measured halfway is somewhere else after.
        await this.page.waitForTimeout(600);
    }

    /**
     *  Draws a red frame around something, the way a picture points at a part of the screen.
     *  Above everything, hit-testing nothing, so it changes nothing it is drawn over.
     *
     *  @param target what to frame - a selector's first match, or an area in CSS pixels
     *  @param air how far the frame stands off it, in CSS pixels
     *  @param width how thick the frame is
     *  @param round true for a ring rather than a box - around a round button
     */
    async outline(target: string | Box, air = 2, width = 4, round = false): Promise<void> {
        const box = typeof target === "string" ? (await this.page.locator(target).first().boundingBox())! : target;
        await this.page.evaluate(({ box, air, width, round }) => {
            const frame = document.createElement("div");
            frame.className = "screenshot-outline";
            // Around the element with a little air, but never past the window's edge - the
            // side panel's rail touches two of them.
            const left = Math.max(0, box.x - air);
            const top = Math.max(0, box.y - air);
            const right = Math.min(window.innerWidth, box.x + box.width + air);
            const bottom = Math.min(window.innerHeight, box.y + box.height + air);
            frame.style.cssText = "position:fixed;margin:0;padding:0;background:none;overflow:visible;"
                + `pointer-events:none;border:${width}px solid #e11d24;box-sizing:border-box;`
                + `border-radius:${round ? "50%" : "6px"};`
                + `left:${left}px;top:${top}px;width:${right - left}px;height:${bottom - top}px`;
            frame.popover = "manual";
            document.documentElement.appendChild(frame);
            frame.showPopover();
        }, { box, air, width, round });
    }

    /** Where something is, in CSS pixels - its first match. */
    async boxOf(selector: string): Promise<Box> {
        return (await this.page.locator(selector).first().boundingBox())!;
    }

    /**
     *  Rests the pointer on a history entry in the open side panel, so it is drawn hovered
     *  with its buttons, and draws the pointer there.
     *
     *  @param title what the entry's title starts with
     */
    async hoverHistoryEntry(title: string): Promise<void> {
        const row = this.historyRow(title);
        const box = (await row.boundingBox())!;
        await this.movePointerTo(box.x + box.width * 0.45, box.y + box.height * 0.3);
    }

    /**
     *  The area of a history entry and the entries either side of it, for a close-up.
     *
     *  @param title what the middle entry's title starts with
     */
    async historyRowsAround(title: string): Promise<{ x: number; y: number; width: number; height: number }> {
        return this.historyRow(title).evaluate(row => {
            const above = (row.previousElementSibling ?? row).getBoundingClientRect();
            const below = (row.nextElementSibling ?? row).getBoundingClientRect();
            const own = row.getBoundingClientRect();
            const margin = 6;
            return {
                x: own.left - margin, y: above.top - margin,
                width: own.width + 2 * margin, height: below.bottom - above.top + 2 * margin,
            };
        });
    }

    private historyRow(title: string) {
        return this.page.locator(".closed-tabs__list--history .closed-tabs__row")
            .filter({ has: this.page.locator(".closed-tabs__row-title", { hasText: title }) }).first();
    }

    /**
     *  Moves the pointer to the open side panel's foot, below its list: the panel stays open -
     *  the pointer is still in it - and no row is drawn hovered.
     */
    async restPointerInSidePanel(): Promise<void> {
        const panel = (await this.page.locator(".closed-tabs.closed-tabs--open").boundingBox())!;
        await this.page.mouse.move(panel.x + panel.width * 0.6, panel.y + panel.height - 12, { steps: 5 });
        await this.page.waitForTimeout(300);
    }

    /**
     *  Rests the pointer on one recently closed tab in the open side panel, so it is drawn
     *  hovered, and draws the pointer there.
     *
     *  @param index which row, from 0 at the top
     */
    async hoverClosedTab(index: number): Promise<void> {
        const row = this.page.locator(".closed-tabs__list--closed .closed-tabs__row").nth(index);
        const box = (await row.boundingBox())!;
        // On the title line, clear of the time and the device under it.
        await this.movePointerTo(box.x + box.width * 0.55, box.y + box.height * 0.2);
    }

    /**
     *  Rests the pointer on the first search suggestion of one kind, so it is the highlighted
     *  one, and draws the pointer there. The suggestions have to be open - see `search`.
     *
     *  @param kind "link", "closedTab", "visit", "openTab" or "web"
     */
    async hoverSuggestion(kind: string): Promise<void> {
        const row = this.page.locator(`li.search-bar__suggestion--${kind}`).first();
        const box = (await row.boundingBox())!;
        await this.movePointerTo(box.x + box.width * 0.3, box.y + box.height * 0.35);
    }

    /**
     *  Opens a subgroup's options menu from its ⋮ button.
     *
     *  @param index which subgroup on the page, from 0 at the top of the first group
     */
    async openSubgroupMenu(index: number): Promise<void> {
        await this.page.locator("link-subgroup").nth(index)
            .locator("button:has(> options-menu)").first().click();
        await this.page.locator("options-menu.visible").waitFor();
    }

    /**
     *  Right-clicks a link, opening its context menu where the pointer is.
     *
     *  @param title the link's title as the page shows it
     */
    async openLinkContextMenu(title: string): Promise<void> {
        const link = this.page.locator("link-container").filter({ hasText: title }).first();
        const box = (await link.boundingBox())!;
        await this.movePointerTo(box.x + box.width * 0.5, box.y + box.height * 0.5);
        await this.page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5, { button: "right" });
        await this.page.locator("options-menu.visible").waitFor();
    }

    /**
     *  Rests the pointer on an item of the open menu - an options menu or a context menu, they
     *  are drawn alike - so it is drawn hovered, and draws the pointer there.
     *
     *  @param key the item's wording, as a key under the locale files ("link.menu.edit")
     */
    async hoverMenuItem(key: string): Promise<void> {
        const item = this.page.locator("options-menu.visible options-menu-item")
            .getByText(this.t(key), { exact: true }).first();
        const box = (await item.boundingBox())!;
        // Fades in: measured before it has settled, a hover is a hover of where it was going.
        await this.page.waitForTimeout(300);
        await this.movePointerTo(box.x + box.width * 0.6, box.y + box.height * 0.55);
    }

    /**
     *  Moves the pointer and draws it. A headless browser has no pointer of its own on
     *  screen, so a picture of a hover would otherwise show the effect and not the cause.
     */
    async movePointerTo(x: number, y: number): Promise<void> {
        await this.page.mouse.move(x, y, { steps: 5 });
        await this.page.evaluate(({ x, y }) => {
            let pointer = document.getElementById("screenshot-pointer");
            if (!pointer) {
                pointer = document.createElement("div");
                pointer.id = "screenshot-pointer";
                // The classic arrow, tip at the element's top left corner; outside the page's
                // own stacking and hit-testing, so it changes nothing it is drawn over.
                pointer.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="30"
                    viewBox="0 0 20 30"><path d="M1 1 L1 23 L6.5 17.5 L10.5 27 L14 25.5 L10 16.5 L17.5 16.5 Z"
                    fill="#000" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
                pointer.style.cssText = "position:fixed;inset:auto;margin:0;padding:0;border:0;"
                    + "background:none;overflow:visible;pointer-events:none;"
                    + "width:20px;height:30px;filter:drop-shadow(0 1px 1px rgba(0,0,0,.4))";
                // A popover, because the menus and the search suggestions are: the top layer
                // is drawn above every z-index, and the last one shown is drawn above the rest.
                pointer.popover = "manual";
                document.documentElement.appendChild(pointer);
            }
            pointer.style.left = `${x - 1}px`;
            pointer.style.top = `${y - 1}px`;
            if (pointer.matches(":popover-open")) {
                pointer.hidePopover();
            }
            pointer.showPopover();
        }, { x, y });
    }

    /**
     *  Adds profiles beside the open one, each holding workspaces with a group and some links
     *  in them, then reloads so the profiles menu lists them. The open profile stays open.
     *
     *  @param profiles each one's name, its workspaces' names and how many links it holds in all
     */
    async addProfiles(profiles: { name: string; workspaces: string[]; links: number }[]): Promise<void> {
        await this.page.evaluate(async profiles => {
            const { profile_registry: registry } = await chrome.storage.local.get("profile_registry") as {
                profile_registry: { profiles: Record<string, object> };
            };
            const writes: Record<string, unknown> = {};
            let createdAt = Date.now() - 90 * 24 * 60 * 60 * 1000;
            for (const [index, profile] of profiles.entries()) {
                // Fixed, so the order they are listed in - the stored order - is the same every run.
                const id = `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
                const data = { environments: {} as Record<string, object>, groups: {} as Record<string, object>,
                    subgroups: {}, links: {} as Record<string, object>, activeEnvironmentId: null as string | null };
                const groupIds = profile.workspaces.map((name, order) => {
                    const environmentId = crypto.randomUUID();
                    const groupId = crypto.randomUUID();
                    data.environments[environmentId] = { id: environmentId, name, createdAt, order };
                    data.groups[groupId] = { id: groupId, title: name, environmentId, createdAt, order: 0 };
                    data.activeEnvironmentId ??= environmentId;
                    return { environmentId, groupId };
                });
                // Spread over the workspaces in turn; never drawn, only counted by the manager.
                for (let index = 0; index < profile.links; index++) {
                    const { environmentId, groupId } = groupIds[index % groupIds.length];
                    const linkId = crypto.randomUUID();
                    data.links[linkId] = { id: linkId, title: `Link ${index + 1}`, url: `https://example.com/${index + 1}`,
                        environmentId, groupId, type: "link", position: Math.floor(index / groupIds.length), createdAt };
                }
                registry.profiles[id] = { id, name: profile.name, createdAt: createdAt++ };
                writes[`app_state_${id}`] = data;
            }
            await chrome.storage.local.set({ ...writes, profile_registry: registry });
        }, profiles);
        await this.page.reload();
        await this.page.waitForSelector("workspace-plane link-group");
    }

    /**
     *  Adds empty workspaces to the open profile, after the ones it has - the switcher lists
     *  them by when they were made - then reloads. The open workspace stays open.
     *
     *  @param names the workspaces' names, in the order the switcher is to list them
     */
    async addWorkspaces(names: string[]): Promise<void> {
        await this.page.evaluate(async names => {
            const { profile_registry: registry } = await chrome.storage.local.get("profile_registry") as {
                profile_registry: { activeProfileId: string };
            };
            const stateKey = `app_state_${registry.activeProfileId}`;
            const { [stateKey]: state } = await chrome.storage.local.get(stateKey) as
                Record<string, { environments: Record<string, { createdAt: number }> }>;
            let createdAt = Math.max(...Object.values(state.environments).map(workspace => workspace.createdAt)) + 1;
            for (const [index, name] of names.entries()) {
                const id = `00000000-0000-4000-9000-${String(index + 1).padStart(12, "0")}`;
                state.environments[id] = { id, name, createdAt: createdAt++ } as { createdAt: number };
            }
            await chrome.storage.local.set({ [stateKey]: state });
        }, names);
        await this.page.reload();
        await this.page.waitForSelector("workspace-plane link-group");
    }

    /** Opens the profiles menu from its button in the header ("Profile: …"). */
    async openProfilesMenu(): Promise<void> {
        await this.page.locator(".action-user-profiles-menu").click();
        await this.page.locator("options-menu.visible").waitFor();
        // Fades in: a picture taken at once catches it half drawn.
        await this.page.waitForTimeout(300);
    }

    /** Opens the profile manager from the profiles menu's last entry. */
    async openProfileManager(): Promise<void> {
        await this.openProfilesMenu();
        await this.page.locator("options-menu.visible options-menu-item")
            .getByText(this.t("header.profileMenu.manage"), { exact: false }).first().click();
        await this.page.locator("dialog.profile-manager[open]").waitFor();
        await this.pointerAway();
        await this.page.waitForTimeout(300);
    }

    /**
     *  The area holding everything the selectors match - the first match of each - with a
     *  margin around it, kept inside the window: a close-up of those things together.
     */
    async areaAround(selectors: string[], margin: number): Promise<{ x: number; y: number; width: number; height: number }> {
        const boxes = await Promise.all(selectors.map(async selector =>
            (await this.page.locator(selector).first().boundingBox())!));
        const viewport = this.page.viewportSize()!;
        const left = Math.max(0, Math.min(...boxes.map(box => box.x)) - margin);
        const top = Math.max(0, Math.min(...boxes.map(box => box.y)) - margin);
        const right = Math.min(viewport.width, Math.max(...boxes.map(box => box.x + box.width)) + margin);
        const bottom = Math.min(viewport.height, Math.max(...boxes.map(box => box.y + box.height)) + margin);
        return { x: left, y: top, width: right - left, height: bottom - top };
    }

    /** Reloads the page and waits until the groups are drawn again. */
    async reload(): Promise<void> {
        await this.page.reload();
        await this.page.waitForSelector("workspace-plane link-group");
    }

    /**
     *  Changes the open profile's settings - `{ hideTips: false }` - and reloads.
     *
     *  @param changes setting names and values, merged into what the profile has
     */
    async setProfileSettings(changes: Record<string, unknown>): Promise<void> {
        await this.page.evaluate(async changes => {
            const { profile_registry: registry } = await chrome.storage.local.get("profile_registry") as {
                profile_registry: { activeProfileId: string; profiles: Record<string, { settings?: object }> };
            };
            const profile = registry.profiles[registry.activeProfileId];
            profile.settings = { ...profile.settings, ...changes };
            await chrome.storage.local.set({ profile_registry: registry });
        }, changes);
        await this.reload();
    }

    /**
     *  Signs the staged premium account out, so the page is a free one's and draws the ad slot,
     *  and waits until the slot - the website's page in a frame - says it is ready.
     */
    async becomeFree(): Promise<void> {
        await this.page.evaluate(() => chrome.storage.local.remove(["sync_session", "account_standing"]));
        await this.reload();
        await this.page.locator(".ads-bar__frame:not([hidden])").waitFor({ timeout: 30_000 });
        // The frame's own page draws after it says it is ready.
        await this.page.waitForTimeout(1500);
    }

    /**
     *  Removes every profile and its data, and the staged account - a first run is signed in
     *  to nothing - leaving the device preferences and the background, and reloads: the
     *  screen a first run opens on.
     */
    async wipeToFirstRun(): Promise<void> {
        await this.page.evaluate(async () => {
            const everything = await chrome.storage.local.get(null);
            await chrome.storage.local.remove(Object.keys(everything)
                .filter(key => key.startsWith("profile_registry") || key.startsWith("app_state_")
                    || key === "sync_session" || key === "account_standing"));
        });
        await this.page.reload();
        await this.page.locator("#act-load-defaults").waitFor();
        await this.pointerAway();
    }

    /**
     *  Folds or unfolds a subgroup the way a user does - a click on its heading.
     *
     *  @param index which subgroup on the page, from 0 at the top of the first group
     */
    async toggleSubgroup(index: number): Promise<void> {
        const head = this.page.locator("link-subgroup").nth(index).locator("link-subgroup-head").first();
        const box = (await head.boundingBox())!;
        await this.page.mouse.click(box.x + 20, box.y + 10);
        await this.pointerAway();
        await this.page.waitForTimeout(400);
    }

    /** The area of a subgroup, for a frame. */
    async subgroupBox(index: number): Promise<Box> {
        return (await this.page.locator("link-subgroup").nth(index).boundingBox())!;
    }

    /**
     *  A close-up of a subgroup: as wide as its group, and only a little taller than itself, so
     *  the rows above and below stay out of it.
     */
    async subgroupCloseUp(index: number): Promise<Box> {
        const subgroup = this.page.locator("link-subgroup").nth(index);
        const own = (await subgroup.boundingBox())!;
        const group = (await this.page.locator("link-group").filter({ has: subgroup }).first().boundingBox())!;
        const margin = 6;
        return { x: group.x - margin, y: own.y - margin, width: group.width + 2 * margin, height: own.height + 2 * margin };
    }

    /**
     *  The selector of a row in the open Settings, found by its title.
     *
     *  @param key the setting's key under `settings` in the locale files ("hideTips")
     */
    settingsRow(key: string): string {
        return `.settings-dialog__row:has(.settings-dialog__name:text-is("${this.t(`settings.${key}.title`)}"))`;
    }

    /** Scrolls something into the middle of whatever scrolls it - a row of Settings. */
    async scrollToMiddle(selector: string): Promise<void> {
        await this.page.locator(selector).first().evaluate(element => element.scrollIntoView({ block: "center" }));
        await this.page.waitForTimeout(200);
    }

    /**
     *  The selector of an item of the open options menu, found by its wording.
     *
     *  @param key the item's key in the locale files ("subgroup.menu.catchLinks")
     */
    menuItem(key: string): string {
        return `options-menu.visible options-menu-item:has-text("${this.t(key)}")`;
    }

    /** Opens the search engine dropdown, the button at the search bar's left end. */
    async openSearchEngines(): Promise<void> {
        await this.page.locator(".search-bar__engine-button").click();
        await this.page.locator("ul.search-bar__engines:popover-open").waitFor();
        await this.pointerAway();
        // Fades in: a picture taken at once catches it half drawn.
        await this.page.waitForTimeout(300);
    }

    /** Types into the search bar and waits for the suggestions under it. */
    async search(query: string): Promise<void> {
        await this.page.locator("input.search-bar__input").pressSequentially(query, { delay: 50 });
        await this.page.locator("ul.search-bar__suggestions li").first().waitFor();
    }
}
