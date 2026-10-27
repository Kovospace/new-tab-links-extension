import { test as base, chromium, type BrowserContext, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const EXTENSION_DIR = path.join(ROOT, "dist");
const OUTPUT_DIR = path.join(__dirname, "out");

/** Every picture is taken at this moment, so "2 hours ago" reads the same on every run. */
const FIXED_TIME = new Date("2026-10-27T10:00:00");

/**
 *  Hosts that make a picture differ from run to run: the ad slot, the account, the usage
 *  counter. Refused, they leave the page as it is offline, which it treats as an ordinary
 *  state. Favicons still come from the network for now.
 */
const BLOCKED_HOSTS = ["https://tabilinks.app/**", "https://api.tabilinks.app/**"];

/** Set per project in playwright.config.ts. */
export interface ShotOptions {
    /** The interface language, written into the device preferences before the page draws. */
    language: string;
}

interface ShotFixtures {
    /** A Chromium with dist/ loaded, in a profile nothing else has touched. */
    context: BrowserContext;
    extensionId: string;
    /** The new tab page, in the project's language, showing the demo data. */
    newTab: Page;
    /** Saves the page as out/<language>/<name>.png. */
    shoot: (name: string) => Promise<void>;
}

export const test = base.extend<ShotFixtures & ShotOptions>({
    language: ["en", { option: true }],

    // Replaces the runner's own context: an extension loads only into a persistent one, and
    // only into the full Chromium - the headless shell it uses by default loads none. Google
    // Chrome would not do either: since 137 it ignores --load-extension.
    context: async ({ viewport, deviceScaleFactor, locale, colorScheme }, use, testInfo) => {
        const context = await chromium.launchPersistentContext(testInfo.outputPath("profile"), {
            channel: "chromium",
            headless: true,
            viewport, deviceScaleFactor, locale, colorScheme,
            args: [
                `--disable-extensions-except=${EXTENSION_DIR}`,
                `--load-extension=${EXTENSION_DIR}`,
            ],
        });
        for (const host of BLOCKED_HOSTS) {
            await context.route(host, route => route.abort());
        }
        await use(context);
        await context.close();
    },

    // Derived from the path the extension was loaded from; read off its service worker.
    extensionId: async ({ context }, use) => {
        const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
        await use(new URL(worker.url()).host);
    },

    newTab: async ({ context, extensionId, language }, use) => {
        const page = await context.newPage();
        await page.clock.setFixedTime(FIXED_TIME);
        // The tip on the workspace is chosen at random; always the first one instead.
        await page.addInitScript(() => { Math.random = () => 0; });
        await seedExamples(page, extensionId, language);
        await use(page);
    },

    shoot: async ({ newTab, language }, use) => {
        await use(async name => {
            const directory = path.join(OUTPUT_DIR, language);
            await mkdir(directory, { recursive: true });
            await newTab.screenshot({
                path: path.join(directory, `${name}.png`),
                animations: "disabled",
                caret: "hide",
            });
        });
    },
});

/**
 *  Puts the "Load examples" set in place, the way a new user reaches it - the first-run page's
 *  button. The language goes into the device preferences first, so the page the button reloads
 *  is already drawn in it. A curated demo set (an en and an sk dump of chrome.storage.local)
 *  is meant to replace this.
 */
async function seedExamples(page: Page, extensionId: string, language: string): Promise<void> {
    await page.goto(`chrome-extension://${extensionId}/index.html`);
    await page.evaluate(lang => chrome.storage.local.set({ device_preferences: { language: lang } }), language);
    await page.reload();
    await Promise.all([
        page.waitForEvent("load"),
        page.click("#act-load-defaults"),
    ]);
    await page.waitForSelector("workspace-plane link-group");
}
