import { test } from "./support/test";

/**
 *  The Chrome Web Store screenshots, 1280x800, each rendered once per language.
 *
 *  A scene names the fixtures it needs, acts through `newTab`, and calls `shoot`. Anything a
 *  second scene would need too belongs in support/newTabPage.ts, not here.
 */

test("home", async ({ newTab, shoot }) => {
    await newTab.pointerAway();
    await shoot("1-home");
});

test("search suggestions", async ({ newTab, shoot }) => {
    await newTab.search("you");
    await shoot("2-search");
});

test.describe("light theme", () => {
    // Preferences are in place before the page draws; one setting changes a whole group.
    test.use({ preferences: { theme: "light" } });

    test("settings, background", async ({ newTab, shoot }) => {
        await newTab.openSettings("background");
        await shoot("5-settings-background");
    });
});
