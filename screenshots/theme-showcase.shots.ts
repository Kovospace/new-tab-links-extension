import { test } from "./support/test";

/**
 *  The website home page's light-and-dark comparison: each screen is rendered twice, light and
 *  dark, and the page lays the dark picture over the light one and clips it where the reader
 *  drags. So the two of a pair must differ in the theme alone - same data, same picture
 *  behind, same pointer - which is why every scene is written once and run for both.
 *
 *  1280x800 at 3x; the website derives _2x and _1x itself (its image-maintainer), and looks
 *  for `<n>-<light|dark>_3x` in `public/images/<lang>/theme-showcase/`.
 */
test.use({ deviceScaleFactor: 3 });

/** The picture behind every screen, in both themes. */
const BACKGROUND = 6;

for (const theme of ["light", "dark"] as const) {
    test.describe(theme, () => {
        test.use({ preferences: { theme } });

        test("home", async ({ newTab, shoot }) => {
            await newTab.chooseBackground(BACKGROUND);
            await shoot(`1-${theme}_3x`);
        });

        test.describe("recently closed", () => {
            test.use({ preferences: { theme, sidePanelCard: "closed" } });

            test("side panel, a row hovered", async ({ newTab, shoot }) => {
                await newTab.chooseBackground(BACKGROUND);
                await newTab.openSidePanel();
                await newTab.hoverClosedTab(2);
                await shoot(`2-${theme}_3x`);
            });
        });

        test("search suggestions", async ({ newTab, shoot }) => {
            await newTab.chooseBackground(BACKGROUND);
            await newTab.search("music");
            await newTab.hoverSuggestion("visit");
            await shoot(`3-${theme}_3x`);
        });

        test("settings, background", async ({ newTab, shoot }) => {
            await newTab.chooseBackground(BACKGROUND);
            await newTab.openSettings("background");
            await shoot(`4-${theme}_3x`);
        });

        test("subgroup menu", async ({ newTab, shoot }) => {
            await newTab.chooseBackground(BACKGROUND);
            await newTab.openSubgroupMenu(1);
            await newTab.hoverMenuItem("subgroup.menu.editTitle");
            await shoot(`5-${theme}_3x`);
        });

        test("link context menu", async ({ newTab, shoot }) => {
            await newTab.chooseBackground(BACKGROUND);
            await newTab.openLinkContextMenu("Brave Search");
            await newTab.hoverMenuItem("link.menu.edit");
            await shoot(`6-${theme}_3x`);
        });
    });
}
