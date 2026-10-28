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

    /** Types into the search bar and waits for the suggestions under it. */
    async search(query: string): Promise<void> {
        await this.page.locator("input.search-bar__input").pressSequentially(query, { delay: 50 });
        await this.page.locator("ul.search-bar__suggestions li").first().waitFor();
    }
}
