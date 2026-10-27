import { test as base, type BrowserContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { extensionIdOf, launchWithExtension } from "./browser";
import { translator, type Translate } from "./i18n";
import { NewTabPage } from "./newTabPage";
import { holdStill, openWithExamples, settle, type StagePreferences } from "./stage";

/**
 *  Pictures are kept per release: versions/<version>/<target>/<language>/<name>.png. The
 *  version is the manifest's, so a run before a release overwrites that release's pictures,
 *  and earlier releases' stay as they were - for documentation of an older version.
 */
const VERSIONS_DIR = path.resolve(__dirname, "..", "versions");
const VERSION: string = JSON.parse(
    readFileSync(path.resolve(__dirname, "..", "..", "public", "manifest.json"), "utf8")).version;

/** A target is the scene file's name: store.shots.ts renders "store". */
function targetOf(sceneFile: string): string {
    return path.basename(sceneFile, ".shots.ts");
}

/** Options a project or a scene sets: `test.use({ preferences: { theme: "light" } })`. */
export interface ShotOptions {
    /** The interface language; set per project in playwright.config.ts. */
    language: string;
    /** Device preferences in place before the page draws. */
    preferences: StagePreferences;
}

/** What a scene asks for by name; each is made only when a scene asks for it. */
interface ShotFixtures {
    /** A Chromium with dist/ loaded, in a profile nothing else has touched. */
    context: BrowserContext;
    extensionId: string;
    /** The extension's wording in the project's language. */
    t: Translate;
    /** The new tab page with the demo data, held still, ready for a scene to act on. */
    newTab: NewTabPage;
    /** Lets the page settle and saves it as versions/<version>/<target>/<language>/<name>.png. */
    shoot: (name: string) => Promise<void>;
}

/**
 *  The `test` every scene imports instead of Playwright's: the same function, with the
 *  fixtures above added. A fixture is a setup a scene asks for by naming it - everything
 *  before `use()` runs first, everything after it once the scene is done.
 */
export const test = base.extend<ShotFixtures & ShotOptions>({
    language: ["en", { option: true }],
    preferences: [{}, { option: true }],

    // Replaces the runner's own context, which cannot load an extension.
    context: async ({ viewport, deviceScaleFactor, locale, colorScheme }, use, testInfo) => {
        const context = await launchWithExtension(testInfo.outputPath("profile"),
            { viewport, deviceScaleFactor, locale, colorScheme });
        await use(context);
        await context.close();
    },

    extensionId: async ({ context }, use) => {
        await use(await extensionIdOf(context));
    },

    t: async ({ language }, use) => {
        await use(translator(language));
    },

    newTab: async ({ context, extensionId, language, preferences, t }, use) => {
        const page = await context.newPage();
        await holdStill(page);
        await openWithExamples(page, extensionId, language, preferences);
        await use(new NewTabPage(page, t));
    },

    shoot: async ({ newTab, language }, use, testInfo) => {
        await use(async name => {
            await settle(newTab.page);
            const directory = path.join(VERSIONS_DIR, VERSION, targetOf(testInfo.file), language);
            await mkdir(directory, { recursive: true });
            await newTab.page.screenshot({
                path: path.join(directory, `${name}.png`),
                animations: "disabled",
                caret: "hide",
            });
        });
    },
});
