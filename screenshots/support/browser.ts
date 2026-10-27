import { chromium, type BrowserContext, type BrowserContextOptions } from "@playwright/test";
import path from "node:path";

/** The built extension: `npm run screenshots` builds it first. */
const EXTENSION_DIR = path.resolve(__dirname, "..", "..", "dist");

/**
 *  Hosts that make a picture differ from run to run: the ad slot, the account, the usage
 *  counter. Refused, they leave the page as it is offline, which it treats as an ordinary
 *  state. Favicons still come from the network.
 */
const BLOCKED_HOSTS = ["https://tabilinks.app/**", "https://api.tabilinks.app/**"];

/**
 *  A Chromium with the extension loaded, in a profile of its own.
 *
 *  An extension loads only into a persistent context, and only into the full Chromium: the
 *  headless shell the runner uses by default loads none. Google Chrome would not do either -
 *  since 137 it ignores --load-extension.
 *
 *  @param profileDir an empty directory; the runner hands each scene its own
 *  @param options    viewport, locale and the rest, as the project in playwright.config.ts sets them
 */
export async function launchWithExtension(
    profileDir: string,
    options: BrowserContextOptions
): Promise<BrowserContext> {
    const context = await chromium.launchPersistentContext(profileDir, {
        ...options,
        channel: "chromium",
        headless: true,
        args: [
            `--disable-extensions-except=${EXTENSION_DIR}`,
            `--load-extension=${EXTENSION_DIR}`,
        ],
    });
    for (const host of BLOCKED_HOSTS) {
        await context.route(host, route => route.abort());
    }
    return context;
}

/** The extension's id - derived from the path it was loaded from - read off its service worker. */
export async function extensionIdOf(context: BrowserContext): Promise<string> {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    return new URL(worker.url()).host;
}
