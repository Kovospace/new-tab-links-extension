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

    /** Types into the search bar and waits for the suggestions under it. */
    async search(query: string): Promise<void> {
        await this.page.locator("input.search-bar__input").pressSequentially(query, { delay: 50 });
        await this.page.locator("ul.search-bar__suggestions li").first().waitFor();
    }
}
