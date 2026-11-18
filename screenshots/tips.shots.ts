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
        // Under Functions since #183, beside favorites and drag & drop.
        await newTab.openSettings("functions");
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

/** The page being bookmarked in the tips about saving - in the picture's language. */
const PAGE_TO_SAVE: Record<string, { url: string; title: string }> = {
    en: { url: "https://en.wikipedia.org/wiki/Web_browser", title: "Web browser - Wikipedia" },
    sk: { url: "https://sk.wikipedia.org/wiki/Webový_prehliadač", title: "Webový prehliadač – Wikipédia" },
};

/** The new group a page is saved into, in the tips about saving. */
const NEW_GROUP: Record<string, string> = { en: "Reading", sk: "Na čítanie" };

test.describe("bookmark-into-new-group", () => {
    const shot = (name: string) => `bookmark-into-new-group/${name}_3x`;
    test.use({ preferences: { sidePanelCard: "closed" } });

    // The "+" of a closed tab opens the same form as the toolbar button.
    test("side panel, a closed tab's + ringed", async ({ newTab, shoot }) => {
        await newTab.chooseBackground(BACKGROUND);
        await newTab.openSidePanel();
        await newTab.hoverClosedTab(0);
        const plus = ".closed-tabs__list--closed .closed-tabs__row >> nth=0 >> .closed-tabs__row-action.add";
        await newTab.outline(plus, 4, 4, true);
        await shoot(shot("panel-ulozit"));
    });

    // The bookmarking popup - the toolbar button, the shortcut, "Choose a place…".
    test("the bookmarking popup, a new group being named", async ({ newTab, shoot, t, language }) => {
        await newTab.chooseBackground(BACKGROUND);
        const popup = await newTab.openBookmarkPopup(PAGE_TO_SAVE[language] ?? PAGE_TO_SAVE.en);
        await popup.getByLabel(t("bookmark.fields.group"), { exact: true })
            .selectOption({ label: t("bookmark.newGroup.option") });
        await popup.getByLabel(t("bookmark.fields.newGroup"), { exact: true }).fill(NEW_GROUP[language] ?? NEW_GROUP.en);
        await popup.mouse.move(5, 5);
        await popup.waitForTimeout(300);
        await shoot(shot("nova-skupina"), { page: popup, clip: (await popup.locator(".bookmark-panel").boundingBox())! });
    });
});

test.describe("discover-premium-features", () => {
    // Signed in, not premium: the application menu offers the upgrade.
    test("application menu, the upgrade framed", async ({ newTab, shoot }) => {
        await newTab.chooseBackground(BACKGROUND);
        await newTab.page.evaluate(() => chrome.storage.local.set({
            account_standing: { userId: "screenshots", premium: false, checkedAt: Date.now() } }));
        await newTab.reload();
        await newTab.page.locator(".ads-bar__frame:not([hidden])").waitFor({ timeout: 30_000 });
        await newTab.page.waitForTimeout(1500);
        await newTab.page.click(".action-app-menu");
        await newTab.page.locator("options-menu.visible").waitFor();
        await newTab.page.waitForTimeout(300);
        await newTab.outline(newTab.menuItem("sync.menu.upgradeToPremium"), 3, 4);
        await shoot("discover-premium-features/premium-menu_3x");
    });
});

test.describe("saving-from-webpage", () => {
    // The popup the toolbar button and the shortcut open; the right-click menu (1) is the
    // browser's own and cannot be drawn here.
    test("the bookmarking popup", async ({ newTab, shoot, language }) => {
        await newTab.chooseBackground(BACKGROUND);
        const popup = await newTab.openBookmarkPopup(PAGE_TO_SAVE[language] ?? PAGE_TO_SAVE.en);
        const panel = (await popup.locator(".bookmark-panel").boundingBox())!;
        await shoot("saving-from-webpage/2_3x", { page: popup, clip: panel });
    });
});

test.describe("setup-privacy", () => {
    // This browser synchronising, so the logs' own synchronisation switches are live.
    test("settings, sync & privacy", async ({ newTab, shoot }) => {
        await newTab.chooseBackground(BACKGROUND);
        await newTab.setPreferences({ syncEnabled: true });
        await newTab.reload();
        await newTab.openSettings("privacy");
        await shoot("setup-privacy/nastavenia-sukromie_3x",
            { clip: await newTab.areaAround(["dialog.settings-dialog"], 16) });
    });
});

test.describe("use-drag-and-drop", () => {
    const shot = (name: string) => `use-drag-and-drop/${name}_3x`;

    test("a link held over another group", async ({ newTab, shoot }) => {
        await newTab.chooseBackground(BACKGROUND);
        await newTab.holdLinkOver("Spotify", "LinkedIn");
        await shoot(shot("presun-odkazu"));
        await newTab.page.mouse.up();
    });

    test("settings, enable drag & drop framed", async ({ newTab, shoot }) => {
        await newTab.chooseBackground(BACKGROUND);
        // Under Functions since #183, beside favorites and the tips.
        await newTab.openSettings("functions");
        await newTab.outline(newTab.settingsRow("enableDragAndDrop"), 4, 4);
        await shoot(shot("nastavenia-presun"), { clip: await newTab.areaAround(["dialog.settings-dialog"], 16) });
    });
});

/*  The tips new in 0.5.0, light theme as their notes on the website ask. */

test.describe("favorites", () => {
    const shot = (name: string) => `favorites/${name}_3x`;
    test.use({ preferences: { theme: "light" } });

    test.beforeEach(async ({ newTab }) => {
        await newTab.chooseBackground(BACKGROUND);
        await newTab.setProfileSettings({ enableFavorites: true });
    });

    test("settings, favorites framed", async ({ newTab, shoot }) => {
        await newTab.openSettings("functions");
        await newTab.outline(newTab.settingsRow("enableFavorites"), 4, 4);
        await shoot(shot("1"), { clip: await newTab.areaAround(["dialog.settings-dialog"], 16) });
    });

    // Two golden, and the pointer on an empty one, framed.
    test("a group, its circles, one framed", async ({ newTab, shoot }) => {
        await newTab.markFavorites(["YouTube", "Spotify"]);
        await newTab.hoverFavoriteCircle("SoundCloud");
        await newTab.outline(newTab.favoriteCircle("SoundCloud"), 5, 3);
        await shoot(shot("2"), { clip: await newTab.areaAround(["link-group >> nth=2"], 24) });
    });

    test("a link's context menu, add to favorites framed", async ({ newTab, shoot }) => {
        await newTab.markFavorites(["YouTube", "Spotify"]);
        await newTab.openLinkContextMenu("Bandcamp");
        await newTab.hoverMenuItem("link.menu.addFavorite");
        await newTab.outline(newTab.menuItem("link.menu.addFavorite"), 3, 4);
        await shoot(shot("3"), { clip: await newTab.areaAround(["link-group >> nth=2", "options-menu.visible"], 24) });
    });

    test.describe("the favorites card", () => {
        test.use({ preferences: { theme: "light", sidePanelCard: "favorites" } });

        test("side panel open on favorites", async ({ newTab, shoot }) => {
            await newTab.markFavorites(["YouTube", "Spotify", "Google", "LinkedIn"]);
            await newTab.openSidePanel();
            await newTab.restPointerInSidePanel();
            await shoot(shot("4"));
        });
    });

    test("the toolbar popup, favorites under the form", async ({ newTab, shoot, language }) => {
        await newTab.markFavorites(["YouTube", "Spotify", "Google", "LinkedIn"]);
        const popup = await newTab.openBookmarkPopup(PAGE_TO_SAVE[language] ?? PAGE_TO_SAVE.en);
        await popup.setViewportSize({ width: 520, height: 800 });
        await popup.locator(".popup-favorites__row").first().waitFor();
        await popup.mouse.move(5, 5);
        const panel = (await popup.locator(".bookmark-panel").boundingBox())!;
        const favorites = (await popup.locator(".popup-favorites").boundingBox())!;
        await shoot(shot("5"), { page: popup, clip: {
            x: panel.x, y: panel.y, width: panel.width,
            height: favorites.y + favorites.height - panel.y + 8 } });
    });
});

/** What a fast-paced link grabber kept with Flash save - research for a video, in the picture's language. */
const FLASH_SAVED: Record<string, { title: string; url: string }[]> = {
    en: [
        { title: "Three-point lighting - Wikipedia", url: "https://en.wikipedia.org/wiki/Three-point_lighting" },
        { title: "Free Music Archive", url: "https://freemusicarchive.org/" },
        { title: "Wikimedia Commons - free photos", url: "https://commons.wikimedia.org/" },
        { title: "Shot (filmmaking) - Wikipedia", url: "https://en.wikipedia.org/wiki/Shot_(filmmaking)" },
        { title: "YouTube Creators", url: "https://www.youtube.com/creators/" },
    ],
    sk: [
        { title: "Trojbodové osvetlenie - Wikipédia", url: "https://sk.wikipedia.org/wiki/Trojbodové_osvetlenie" },
        { title: "Free Music Archive", url: "https://freemusicarchive.org/" },
        { title: "Wikimedia Commons - fotografie zadarmo", url: "https://commons.wikimedia.org/" },
        { title: "Záber (film) - Wikipédia", url: "https://sk.wikipedia.org/wiki/Záber" },
        { title: "YouTube Creators", url: "https://www.youtube.com/creators/" },
    ],
};

test.describe("flash-save", () => {
    const shot = (name: string) => `flash-save/${name}_3x`;
    test.use({ preferences: { theme: "light" } });

    test.beforeEach(async ({ newTab }) => {
        await newTab.chooseBackground(BACKGROUND);
    });

    // The group Flash save makes, holding what was kept - as the right-click entry and the shortcut leave it.
    test("the flash save group", async ({ newTab, shoot, t, language }) => {
        await newTab.addGroup(t("bookmark.flashSave.groupName"), FLASH_SAVED[language] ?? FLASH_SAVED.en);
        await newTab.outline(await newTab.boxOf("link-group >> nth=3"), 6, 4);
        await shoot(shot("3"));
    });

    test("settings, fast-paced link grabbing chosen and framed", async ({ newTab, shoot, t }) => {
        await newTab.openSettings("uiAndBehavior");
        const row = newTab.settingsRow("contextMenuMode");
        await newTab.scrollToMiddle(row);
        await newTab.page.locator(row).getByText(t("settings.contextMenuMode.options.flashSave")).click();
        await newTab.pointerAway();
        await newTab.outline(row, 4, 4);
        await shoot(shot("4"), { clip: await newTab.areaAround(["dialog.settings-dialog"], 16) });
    });
});

test.describe("accent-colour", () => {
    const shot = (name: string) => `accent-colour/${name}_3x`;
    // The panel kept open, so its card switcher and search field are in the picture.
    test.use({ preferences: { theme: "light", keepSidePanelOpen: true, sidePanelCard: "closed" } });

    test.beforeEach(async ({ newTab }) => {
        await newTab.chooseBackground(BACKGROUND);
    });

    test("settings, the accent swatches framed", async ({ newTab, shoot }) => {
        await newTab.openSettings("uiAndBehavior");
        const row = newTab.settingsRow("accentColor");
        await newTab.scrollToMiddle(row);
        await newTab.outline(row, 4, 4);
        await shoot(shot("1"), { clip: await newTab.areaAround(["dialog.settings-dialog"], 16) });
    });

    /**
     *  The page's top-left corner three times - amber, blue, magenta: the open space's tab,
     *  the side panel's chosen card and its search field, focused.
     */
    for (const [number, theme] of [[2, "light"], [3, "dark"]] as const) {
        test(`three accents side by side, ${theme}`, async ({ newTab, shootSideBySide }) => {
            await newTab.setPreferences({ theme });
            await newTab.page.locator(`html[data-theme="${theme}"]`).waitFor({ state: "attached" });
            await newTab.page.locator(".closed-tabs input[type=search], .closed-tabs input").first().focus();
            const clip = { x: 0, y: 0, width: 300, height: 150 };
            await shootSideBySide(shot(String(number)), clip, ["amber", "blue", "magenta"].map(accentColor => async () => {
                await newTab.setPreferences({ accentColor });
                await newTab.page.locator(`html[data-accent="${accentColor}"]`).waitFor({ state: "attached" });
            }));
        });
    }
});

/** The examples' second group, Socials - five links, so a resize shows plainly. */
const SOCIALS = 1;

test.describe("resize-and-sort-groups", () => {
    const shot = (name: string) => `resize-and-sort-groups/${name}_3x`;
    test.use({ preferences: { theme: "light" } });

    test.beforeEach(async ({ newTab }) => {
        await newTab.chooseBackground(BACKGROUND);
    });

    // Held mid-drag, wider and taller than its neighbours, the corner ringed.
    test("a group being resized by its corner", async ({ newTab, shoot }) => {
        const corner = await newTab.dragResizeCorner(SOCIALS, { x: 140, y: 120 }, false);
        await newTab.outline({ x: corner.x - 12, y: corner.y - 12, width: 24, height: 24 }, 6, 4, true);
        await shoot(shot("1"));
        await newTab.page.mouse.up();
    });

    // Made shorter than its links: it scrolls. Scrolled part way, the corner ringed.
    test("a group shorter than its links, scrolled", async ({ newTab, shoot }) => {
        const group = newTab.group(0);
        const before = (await group.boundingBox())!;
        await newTab.dragResizeCorner(0, { x: 0, y: -Math.round(before.height * 0.45) });
        await group.evaluate(element => {
            const scroller = [element, ...element.querySelectorAll<HTMLElement>("*")]
                .find(candidate => candidate.scrollHeight > candidate.clientHeight + 4
                    && getComputedStyle(candidate).overflowY !== "visible");
            if (scroller) scroller.scrollTop = (scroller.scrollHeight - scroller.clientHeight) / 2;
        });
        await newTab.outline(await newTab.boxOf("link-group >> nth=0"), 6, 4);
        await shoot(shot("2"));
    });

    // A resized group's menu: Sort links, and Reset size - framed - going back to the automatic size.
    test("a resized group's menu, reset size framed", async ({ newTab, shoot }) => {
        await newTab.dragResizeCorner(SOCIALS, { x: 140, y: 60 });
        await newTab.openGroupMenu(SOCIALS);
        await newTab.hoverMenuItem("group.menu.resetSize");
        await newTab.outline(newTab.menuItem("group.menu.resetSize"), 3, 4);
        await shoot(shot("3"), { clip: await newTab.areaAround(["link-group >> nth=1", "options-menu.visible"], 24) });
    });

    test("the sort links dialog", async ({ newTab, shoot }) => {
        await newTab.openGroupMenu(SOCIALS);
        await newTab.page.locator(newTab.menuItem("group.menu.sortLinks")).click();
        const dialog = newTab.page.locator("dialog[open]").last();
        await dialog.waitFor();
        await newTab.pointerAway();
        await newTab.page.waitForTimeout(300);
        await shoot(shot("4"), { clip: await newTab.areaAround(["dialog[open]"], 16) });
    });
});

/** A browser's bookmarks, as `chrome.bookmarks.getTree()` gives them - in the picture's language. */
function bookmarkTree(language: string, foldersInBar = 4): object[] {
    const sk = language === "sk";
    let id = 10;
    const link = (title: string, url: string) => ({ id: String(id++), title, url, dateAdded: Date.UTC(2025, 3, id) });
    const folder = (title: string, children: object[]) => ({ id: String(id++), title, children });
    const bar = [
        folder(sk ? "Správy" : "News", [link("BBC", "https://www.bbc.com/"), link("Wikipedia", "https://www.wikipedia.org/"),
            link("The Guardian", "https://www.theguardian.com/")]),
        folder(sk ? "Práca" : "Work", [
            link("GitHub", "https://github.com/"), link("Jira", "https://www.atlassian.com/software/jira"),
            folder(sk ? "Dokumentácia" : "Docs", [link("MDN", "https://developer.mozilla.org/"),
                link("TypeScript", "https://www.typescriptlang.org/docs/")]),
            folder(sk ? "Nástroje" : "Tools", [link("Figma", "https://www.figma.com/"), link("Notion", "https://www.notion.so/")]),
        ]),
        folder(sk ? "Recepty" : "Recipes", [link("BBC Good Food", "https://www.bbcgoodfood.com/"),
            link("YouTube", "https://www.youtube.com/results?search_query=recipes")]),
        folder(sk ? "Cestovanie" : "Travel", [link("Booking.com", "https://www.booking.com/"),
            link("Google Maps", "https://maps.google.com/"), link("Wikivoyage", "https://www.wikivoyage.org/")]),
    ];
    for (let extra = bar.length; extra < foldersInBar; extra++) {
        bar.push(folder(`${sk ? "Priečinok" : "Folder"} ${extra + 1}`, [link("Wikipedia", `https://en.wikipedia.org/wiki/${extra}`)]));
    }
    bar.push(link("DuckDuckGo", "https://duckduckgo.com/"));
    return [{ id: "0", title: "", children: [
        { id: "1", title: sk ? "Panel so záložkami" : "Bookmarks bar", children: bar },
        { id: "2", title: sk ? "Ostatné záložky" : "Other bookmarks", children: [
            folder(sk ? "Na čítanie" : "Reading list", [link("Hacker News", "https://news.ycombinator.com/")]),
        ] },
    ] }];
}

test.describe("import-bookmarks", () => {
    const shot = (name: string) => `import-bookmarks/${name}_3x`;
    test.use({ preferences: { theme: "light" } });

    test.beforeEach(async ({ newTab }) => {
        await newTab.chooseBackground(BACKGROUND);
        await newTab.wipeToFirstRun();
    });

    // The first-run welcome, the import tile framed (2, the browser's permission prompt, is by hand).
    // Then the dialog, every folder ticked, and the space it makes.
    test("first run, the dialog, the space after it", async ({ newTab, shoot, t, language }) => {
        const tile = `.welcome-tile:has-text("${t("workspace.welcome.importBookmarks")}")`;
        await newTab.outline(tile, 6, 4);
        await shoot(shot("1"));
        await newTab.page.locator(".screenshot-outline").evaluateAll(frames => frames.forEach(frame => frame.remove()));

        await newTab.standInBrowserBookmarks(bookmarkTree(language));
        await newTab.page.locator(tile).click();
        await newTab.page.locator("dialog[open]").last().waitFor();
        await newTab.pointerAway();
        await newTab.page.waitForTimeout(300);
        await shoot(shot("3"), { clip: await newTab.areaAround(["dialog[open]"], 16) });

        await newTab.page.locator("dialog[open]").last()
            .getByRole("button", { name: t("workspace.bookmarkImport.confirm"), exact: true }).click();
        await newTab.page.locator("workspace-plane link-group").first().waitFor();
        await newTab.pointerAway();
        await shoot(shot("5"));
    });

    // More folders than a space holds groups: the dialog says which limit, and Import is disabled.
    test("the dialog over a limit", async ({ newTab, shoot, t, language }) => {
        await newTab.standInBrowserBookmarks(bookmarkTree(language, 30));
        await newTab.page.locator(`.welcome-tile:has-text("${t("workspace.welcome.importBookmarks")}")`).click();
        await newTab.page.locator("dialog[open]").last().waitFor();
        await newTab.pointerAway();
        await newTab.page.waitForTimeout(300);
        await shoot(shot("4"), { clip: await newTab.areaAround(["dialog[open]"], 16) });
    });
});
