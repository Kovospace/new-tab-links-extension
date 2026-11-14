import { test as base, type BrowserContext, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
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
    /**
     *  Lets the page settle and saves it as versions/<version>/<target>/<language>/<name>.png.
     *  A name may carry a folder - "change-background/pozadie_3x" - for targets kept one
     *  folder per subject, as the tips are. `clip` keeps only that area, in CSS pixels - for a
     *  close-up.
     */
    shoot: (name: string, options?: {
        clip?: { x: number; y: number; width: number; height: number };
        /** Another page of the extension to take instead - the bookmarking popup. */
        page?: Page;
    }) => Promise<void>;
    /**
     *  Saves one picture of the page in both themes, split by a vertical seam - light on the
     *  left, dark on the right - leaving the page dark. The same naming as `shoot`.
     *
     *  @param splitAt where the seam is, in CSS pixels from the left; the middle when not given
     */
    shootThemeSplit: (name: string, splitAt?: number) => Promise<void>;
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
        await use(async (name, options) => {
            const page = options?.page ?? newTab.page;
            await settle(page);
            await page.screenshot({
                path: await pictureFile(testInfo.file, language, name),
                clip: options?.clip,
                animations: "disabled",
                caret: "hide",
            });
        });
    },

    shootThemeSplit: async ({ context, newTab, language }, use, testInfo) => {
        await use(async (name, splitAt) => {
            const halves: Buffer[] = [];
            for (const theme of ["light", "dark"]) {
                await newTab.setPreferences({ theme });
                await newTab.page.locator(`html[data-theme="${theme}"]`).waitFor({ state: "attached" });
                await settle(newTab.page);
                halves.push(await newTab.page.screenshot({ animations: "disabled", caret: "hide" }));
            }
            await writeFile(await pictureFile(testInfo.file, language, name), await joinHalves(context, halves,
                (splitAt ?? newTab.page.viewportSize()!.width / 2) / newTab.page.viewportSize()!.width));
        });
    },
});

/** Where a picture of that name is kept, its folder made: versions/<version>/<target>/<language>/<name>.png. */
async function pictureFile(sceneFile: string, language: string, name: string): Promise<string> {
    const file = path.join(VERSIONS_DIR, VERSION, targetOf(sceneFile), language, `${name}.png`);
    await mkdir(path.dirname(file), { recursive: true });
    return file;
}

/**
 *  The first picture left of the seam beside the second one right of it, as a PNG. Joined on
 *  a canvas in a blank page of the same browser, so the scenes need no image library.
 *
 *  @param seam where the two meet, as a fraction of the width
 */
async function joinHalves(context: BrowserContext, [left, right]: Buffer[], seam: number): Promise<Buffer> {
    const page = await context.newPage();
    try {
        const dataUrl = await page.evaluate(async ([left, right, seam]) => {
            const load = (base64: string) => {
                const image = new Image();
                image.src = `data:image/png;base64,${base64}`;
                return image.decode().then(() => image);
            };
            const [leftImage, rightImage] = await Promise.all([load(left), load(right)]);
            const canvas = document.createElement("canvas");
            canvas.width = leftImage.naturalWidth;
            canvas.height = leftImage.naturalHeight;
            const half = Math.round(canvas.width * Number(seam));
            const drawing = canvas.getContext("2d")!;
            drawing.drawImage(leftImage, 0, 0);
            drawing.drawImage(rightImage, half, 0, canvas.width - half, canvas.height,
                half, 0, canvas.width - half, canvas.height);
            return canvas.toDataURL("image/png");
        }, [left.toString("base64"), right.toString("base64"), String(seam)]);
        return Buffer.from(dataUrl.split(",")[1], "base64");
    } finally {
        await page.close();
    }
}
