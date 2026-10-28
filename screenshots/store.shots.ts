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
        await shoot("5-settings-background");
    });
});
