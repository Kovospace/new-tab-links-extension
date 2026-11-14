import path from "node:path";
import { test } from "./support/test";

/**
 *  The pictures of the website's tips, one folder per tip slug - the folder the website keeps
 *  them in: `public/images/<lang>/tips/<slug>/<name>_3x.png`. The names are the ones the
 *  tip's markdown already references, so a refreshed picture replaces the old one in place.
 *
 *  1280x800 at 3x; the website derives _2x and _1x itself (its image-maintainer).
 */
test.use({ deviceScaleFactor: 3 });

/** The built-in picture the tips show behind the page - the home page's, so they match. */
const BACKGROUND = 6;

/**
 *  "The user's own picture": a dusk sky made for the purpose (ImageMagick, a gradient with
 *  plasma laid over it), not one of the built-in ones - so it reads as somebody's own.
 */
const OWN_PICTURE = path.join(__dirname, "support", "assets", "own-background.jpg");

test.describe("change-background", () => {
    const shot = (name: string) => `change-background/${name}_3x`;

    test("settings, choosing a built-in picture", async ({ newTab, shoot }) => {
        await newTab.chooseBackground(BACKGROUND);
        await newTab.openSettings("background");
        await newTab.hoverBackgroundTile(BACKGROUND);
        await shoot(shot("pozadie_nastavenia"));
    });

    test("settings, the user's own picture", async ({ newTab, shoot }) => {
        await newTab.openSettings("background");
        await newTab.addOwnBackground(OWN_PICTURE);
        // The user's own pictures are the library's first tiles.
        await newTab.hoverBackgroundTile(1);
        await shoot(shot("pozadie_vlastne"));
    });

    // The website home page's first picture - theme-showcase's "home", dark.
    test("home", async ({ newTab, shoot }) => {
        await newTab.chooseBackground(BACKGROUND);
        await shoot(shot("pozadie_priklad"));
    });
});

test.describe("choose-theme", () => {
    // Each picture is light on the left and dark on the right; the style is what differs.
    for (const [number, themeStyle] of [[1, "flat"], [2, "aero"]] as const) {
        test.describe(themeStyle, () => {
            test.use({ preferences: { themeStyle } });

            test("home, light and dark", async ({ newTab, shootThemeSplit }) => {
                // A picture behind, or aero's glass would have nothing to show through it.
                await newTab.chooseBackground(BACKGROUND);
                // Through the groups, not the screen's middle: they end left of it.
                await shootThemeSplit(`choose-theme/${number}_3x`, await newTab.groupsCentre());
            });
        });
    }
});

test.describe("discover-history", () => {
    const shot = (name: string) => `discover-history/${name}_3x`;
    test.use({ preferences: { sidePanelCard: "history" } });

    test("side panel folded, framed", async ({ newTab, shoot }) => {
        await newTab.chooseBackground(BACKGROUND);
        await newTab.outline(".closed-tabs");
        await shoot(shot("panel-zrolovany"));
    });

    test("side panel open", async ({ newTab, shoot }) => {
        await newTab.chooseBackground(BACKGROUND);
        await newTab.openSidePanel();
        await newTab.restPointerInSidePanel();
        await shoot(shot("panel-otvoreny"));
    });

    // Stack Overflow was visited on the other device, so its row says which, on a line of its own.
    test("history entries, one from another device hovered", async ({ newTab, shoot }) => {
        await newTab.chooseBackground(BACKGROUND);
        await newTab.openSidePanel();
        await newTab.hoverHistoryEntry("How do I undo");
        await shoot(shot("panel-pridat-link"), { clip: await newTab.historyRowsAround("How do I undo") });
    });
});

/** The profiles beside the open one - the tip's own example, a work one and a home one. */
const OTHER_PROFILES: Record<string, { name: string; workspaces: string[]; links: number }[]> = {
    en: [
        { name: "Work", links: 64,
            workspaces: ["Development environment", "Testing", "Production", "Customer 1", "Customer 2"] },
        { name: "Home", links: 37, workspaces: ["Development", "Garage", "Band", "Fishing"] },
    ],
    sk: [
        { name: "Práca", links: 64,
            workspaces: ["Vývojové prostredie", "Testovanie", "Produkcia", "Zákazník 1", "Zákazník 2"] },
        { name: "Doma", links: 37, workspaces: ["Vývoj", "Garáž", "Kapela", "Rybárčenie"] },
    ],
};

test.describe("discover-profiles", () => {
    const shot = (name: string) => `discover-profiles/${name}_3x`;
    const PROFILE_BUTTON = ".action-user-profiles-menu";

    test.beforeEach(async ({ newTab, language }) => {
        await newTab.addProfiles(OTHER_PROFILES[language] ?? OTHER_PROFILES.en);
        await newTab.chooseBackground(BACKGROUND);
    });

    test("home, the profile button framed", async ({ newTab, shoot }) => {
        // Thick and with air around, as the tip's earlier picture framed it.
        await newTab.outline(PROFILE_BUTTON, 8, 6);
        await shoot(shot("profil-lokacia"));
    });

    test("the profile button, close", async ({ newTab, shoot }) => {
        await shoot(shot("profil"), { clip: await newTab.areaAround([PROFILE_BUTTON], 40) });
    });

    test("the profiles menu", async ({ newTab, shoot }) => {
        await newTab.openProfilesMenu();
        await shoot(shot("profil-menu"), {
            clip: await newTab.areaAround([PROFILE_BUTTON, "options-menu.visible"], 24) });
    });

    test("the profile manager", async ({ newTab, shoot }) => {
        await newTab.openProfileManager();
        await shoot(shot("profil-manage"), { clip: await newTab.areaAround(["dialog.profile-manager"], 16) });
    });
});

/** The tip's own example of workspaces, after the examples - which stay open. */
const OTHER_WORKSPACES: Record<string, string[]> = {
    en: ["Garage", "Music", "Development"],
    sk: ["Garáž", "Hudba", "Vývoj"],
};

test.describe("discover-workspaces", () => {
    const shot = (name: string) => `discover-workspaces/${name}_3x`;
    const SWITCHER = ".cls-workspace-header-left";

    test.beforeEach(async ({ newTab, language }) => {
        await newTab.addWorkspaces(OTHER_WORKSPACES[language] ?? OTHER_WORKSPACES.en);
        await newTab.chooseBackground(BACKGROUND);
    });

    test("home, the workspace switcher framed", async ({ newTab, shoot }) => {
        await newTab.outline(SWITCHER, 8, 6);
        await shoot(shot("pracovne-plochy-lokacia"));
    });

    // The switcher with its "+", and the open workspace's heading under it.
    test("the workspace switcher, close", async ({ newTab, shoot }) => {
        await shoot(shot("pracovne-plochy"), { clip: await newTab.areaAround([SWITCHER, ".action-add-group"], 24) });
    });
});

test.describe("use-searchbar", () => {
    const shot = (name: string) => `use-searchbar/${name}_3x`;
    const SEARCH_BAR = "form.search-bar";

    test.beforeEach(async ({ newTab }) => {
        await newTab.chooseBackground(BACKGROUND);
    });

    test("home, the search bar framed", async ({ newTab, shoot }) => {
        await newTab.outline(SEARCH_BAR, 8, 6);
        await shoot(shot("searchbar-location"));
    });

    test("the search bar, close", async ({ newTab, shoot }) => {
        await shoot(shot("searchbar-detail"), { clip: await newTab.areaAround([SEARCH_BAR], 16) });
    });

    // A group's name typed: its links come first, by where they are kept ("Examples › Music"),
    // then the history, then the web. The group is "Hudba" in Slovak, so the query is too.
    test("suggestions, a group's links first", async ({ newTab, shoot, language }) => {
        await newTab.search(language === "sk" ? "hudba" : "music");
        await newTab.pointerAway();
        await newTab.page.waitForTimeout(300);
        await shoot(shot("searchbar-suggestions"));
        await shoot(shot("searchbar-suggestions-detail"),
            { clip: await newTab.areaAround([SEARCH_BAR, "ul.search-bar__suggestions"], 16) });
    });

    // Google chosen, so the bar says so and the list shows which is in use.
    test.describe("google chosen", () => {
        test.use({ preferences: { searchEngine: "google" } });

        test("the search engine dropdown", async ({ newTab, shoot }) => {
            await newTab.openSearchEngines();
            await shoot(shot("searchbar-change"),
                { clip: await newTab.areaAround([SEARCH_BAR, "ul.search-bar__engines"], 16) });
        });
    });
});

test.describe("ctrl-d-saves-here", () => {
    test("settings, the save page shortcut framed", async ({ newTab, shoot }) => {
        await newTab.chooseBackground(BACKGROUND);
        await newTab.openSettings("uiAndBehavior");
        const row = newTab.settingsRow("bookmarkShortcut");
        await newTab.scrollToMiddle(row);
        await newTab.outline(row, 4, 4);
        await shoot("ctrl-d-saves-here/skratka-nastavenia_3x",
            { clip: await newTab.areaAround(["dialog.settings-dialog"], 16) });
    });
});

test.describe("disable-ads", () => {
    const shot = (name: string) => `disable-ads/${name}_3x`;

    // Both in one scene: the second frames the place the first one's bar was.
    test("free with the ad bar, premium without it", async ({ newTab, shoot }) => {
        await newTab.chooseBackground(BACKGROUND);
        await newTab.becomeFree();
        const bar = await newTab.boxOf(".ads-bar");
        await newTab.outline(bar, 6, 6);
        await shoot(shot("odstran-reklamu"));

        // The page's own clock, which is frozen: a standing dated after it is not believed.
        await newTab.page.evaluate(() => { const now = Date.now(); return chrome.storage.local.set({
            sync_session: {
                accessToken: "screenshots", refreshToken: "screenshots",
                userId: "screenshots", username: "tabilinks", deviceId: null,
                accessTokenExpiresAt: now + 365 * 24 * 60 * 60 * 1000,
            },
            account_standing: { userId: "screenshots", premium: true, checkedAt: now },
        }); });
        await newTab.reload();
        await newTab.outline(bar, 6, 6);
        await shoot(shot("odstran-reklamu-2"));
    });
});

test.describe("hide-tips", () => {
    const shot = (name: string) => `hide-tips/${name}_3x`;

    test.beforeEach(async ({ newTab }) => {
        await newTab.setProfileSettings({ hideTips: false });
        await newTab.chooseBackground(BACKGROUND);
    });

    test("home, the tips bar framed", async ({ newTab, shoot }) => {
        await newTab.outline(".tips-bar__tip", 6, 6);
        await shoot(shot("tipy-lokacia"));
    });

    test("the tips bar, its buttons framed", async ({ newTab, shoot }) => {
        await newTab.outline(".tips-bar__controls", 6, 4);
        await shoot(shot("tipy"), { clip: await newTab.areaAround([".tips-bar__tip"], 20) });
    });

    test("settings, hide tips framed", async ({ newTab, shoot }) => {
        await newTab.openSettings("uiAndBehavior");
        const row = newTab.settingsRow("hideTips");
        await newTab.outline(row, 4, 4);
        await shoot(shot("tipy-obnovit"), { clip: await newTab.areaAround(["dialog.settings-dialog"], 16) });
    });
});

test.describe("lets-begin", () => {
    const shot = (name: string) => `lets-begin/${name}_3x`;

    test("first run", async ({ newTab, shoot }) => {
        await newTab.chooseBackground(BACKGROUND);
        await newTab.wipeToFirstRun();
        await shoot(shot("1"));
    });

    // With a tip along the bottom, as a new user's page has.
    test("home with the examples", async ({ newTab, shoot }) => {
        await newTab.setProfileSettings({ hideTips: false });
        await newTab.chooseBackground(BACKGROUND);
        await shoot(shot("2"));
    });

    test.describe("closed tabs", () => {
        test.use({ preferences: { sidePanelCard: "closed" } });

        test("side panel open on the closed tabs", async ({ newTab, shoot }) => {
            await newTab.chooseBackground(BACKGROUND);
            await newTab.openSidePanel();
            await newTab.restPointerInSidePanel();
            await shoot(shot("3"));
        });
    });

    test("a subgroup's menu", async ({ newTab, shoot }) => {
        await newTab.chooseBackground(BACKGROUND);
        await newTab.openSubgroupMenu(0);
        await shoot(shot("4"));
    });

    test("a link's context menu", async ({ newTab, shoot }) => {
        await newTab.chooseBackground(BACKGROUND);
        await newTab.toggleSubgroup(0);
        await newTab.openLinkContextMenu("ChatGPT");
        await shoot(shot("5"));
    });
});

/** The AI subgroup unfolded: the examples keep it folded. */
const AI_SUBGROUP = 0;

test.describe("open-all-subgroups-link", () => {
    test("a subgroup, its open-all button ringed", async ({ newTab, shoot }) => {
        await newTab.chooseBackground(BACKGROUND);
        await newTab.toggleSubgroup(AI_SUBGROUP);
        const subgroup = newTab.page.locator("link-subgroup").nth(AI_SUBGROUP);
        const openAll = (await subgroup.locator("link-subgroup-head button").last().boundingBox())!;
        await newTab.outline(openAll, 5, 3, true);
        await shoot("open-all-subgroups-link/podskupina-otvorit-linky_3x",
            { clip: await newTab.subgroupCloseUp(AI_SUBGROUP) });
    });
});

test.describe("roll-the-subgroup", () => {
    const shot = (name: string) => `roll-the-subgroup/${name}_3x`;

    test("home, the subgroup framed", async ({ newTab, shoot }) => {
        await newTab.chooseBackground(BACKGROUND);
        await newTab.toggleSubgroup(AI_SUBGROUP);
        await newTab.outline(await newTab.subgroupBox(AI_SUBGROUP), 6, 6);
        await shoot(shot("podskupina-lokacia"));
    });

    test("the subgroup unfolded", async ({ newTab, shoot }) => {
        await newTab.chooseBackground(BACKGROUND);
        await newTab.toggleSubgroup(AI_SUBGROUP);
        await shoot(shot("podskupina-rozbalena"), { clip: await newTab.subgroupCloseUp(AI_SUBGROUP) });
    });

    test("the subgroup folded", async ({ newTab, shoot }) => {
        await newTab.chooseBackground(BACKGROUND);
        await shoot(shot("podskupina-zrolovana"), { clip: await newTab.subgroupCloseUp(AI_SUBGROUP) });
    });
});

test.describe("set-size", () => {
    const shot = (name: string) => `set-size/${name}_3x`;

    test("settings, the size slider framed", async ({ newTab, shoot }) => {
        await newTab.chooseBackground(BACKGROUND);
        await newTab.openSettings("uiAndBehavior");
        const row = newTab.settingsRow("uiScale");
        await newTab.scrollToMiddle(row);
        await newTab.outline(row, 4, 4);
        await shoot(shot("settings_size"), { clip: await newTab.areaAround(["dialog.settings-dialog"], 16) });
    });

    for (const [percent, scale] of [[100, 1], [75, 0.75]] as const) {
        test(`home at ${percent}%`, async ({ newTab, shoot }) => {
            await newTab.chooseBackground(BACKGROUND);
            await newTab.setPreferences({ scale });
            await newTab.reload();
            await shoot(shot(`velkost-${percent}`));
        });
    }
});

test.describe("subgroup-links-into-tab-group", () => {
    const shot = (name: string) => `subgroup-links-into-tab-group/${name}_3x`;

    for (const [name, key] of [
        ["podskupina-zachytavat-do-kariet", "subgroup.menu.catchLinks"],
        ["podskupina-farba-kariet", "subgroup.menu.tabGroupColor"],
    ] as const) {
        test(`a subgroup's menu, ${key} framed`, async ({ newTab, shoot }) => {
            await newTab.chooseBackground(BACKGROUND);
            await newTab.toggleSubgroup(AI_SUBGROUP);
            await newTab.openSubgroupMenu(AI_SUBGROUP);
            await newTab.outline(newTab.menuItem(key), 3, 4);
            await shoot(shot(name), {
                clip: await newTab.areaAround(["link-subgroup >> nth=0", "options-menu.visible"], 16) });
        });
    }
});
