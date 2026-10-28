import { test } from "./support/test";

/**
 *  The Chrome Web Store screenshots, 1280x800, each rendered once per language.
 *
 *  A scene names the fixtures it needs, acts through `newTab`, and calls `shoot`. Anything a
 *  second scene would need too belongs in support/newTabPage.ts, not here.
 */

/** Light, over the same picture: the store's pictures read as one set. */
const BACKGROUND = 3;

test.describe("light theme", () => {
    // Preferences are in place before the page draws; one setting changes a whole group.
    test.use({ preferences: { theme: "light" } });

    test("home", async ({ newTab, shoot }) => {
        await newTab.chooseBackground(BACKGROUND);
        await shoot("1-home");
    });

    test.describe("recently closed", () => {
        test.use({ preferences: { theme: "light", sidePanelCard: "closed" } });

        test("side panel, a row hovered", async ({ newTab, shoot }) => {
            await newTab.chooseBackground(BACKGROUND);
            await newTab.openSidePanel();
            // The third row is the one closed on the work computer, which says so.
            await newTab.hoverClosedTab(2);
            await shoot("2-recently-closed");
        });
    });

    test("search suggestions", async ({ newTab, shoot }) => {
        await newTab.chooseBackground(BACKGROUND);
        // Matches the profile's links (YouTube Music; in English the whole Music group), a
        // page in the history (Apple Music, visited on the work computer) and the web.
        await newTab.search("music");
        await newTab.hoverSuggestion("visit");
        await shoot("3-search");
    });

    test("settings, background", async ({ newTab, shoot }) => {
        await newTab.openSettings("background");
        await shoot("6-settings-background");
    });
});

/** Dark, over another picture: the menus, and how the page looks the other way. */
const DARK_BACKGROUND = 12;

test.describe("dark theme", () => {
    test.use({ preferences: { theme: "dark" } });

    test("subgroup menu", async ({ newTab, shoot }) => {
        await newTab.chooseBackground(DARK_BACKGROUND);
        // Directories, the open subgroup - its links show under the menu's button.
        await newTab.openSubgroupMenu(1);
        await newTab.hoverMenuItem("subgroup.menu.editTitle");
        await shoot("4-subgroup-menu");
    });

    test.describe("flat", () => {
        test.use({ preferences: { theme: "dark", themeStyle: "flat" } });

        test("link context menu", async ({ newTab, shoot }) => {
            await newTab.chooseBackground(DARK_BACKGROUND);
            // A root-level link of a group with subgroups: the menu offers moving it into them.
            await newTab.openLinkContextMenu("Brave Search");
            await newTab.hoverMenuItem("link.menu.edit");
            await shoot("5-link-context-menu");
        });
    });
});
