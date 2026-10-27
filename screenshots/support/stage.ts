import type { Page } from "@playwright/test";

/** Every picture is taken at this moment, so "2 hours ago" reads the same on every run. */
const FIXED_TIME = new Date("2026-10-27T10:00:00");

/**
 *  Device preferences a scene may set - the stored shape of `DevicePreferences`
 *  (`backend/repository/DevicePreferencesRepository.ts`). Anything left out reads as the
 *  default, so a scene names only what it changes.
 */
export interface StagePreferences {
    theme?: "auto" | "light" | "dark";
    themeStyle?: "aero" | "flat";
    scale?: number;
    sidePanelCard?: "open" | "closed" | "history";
    keepSidePanelOpen?: boolean;
    [other: string]: unknown;
}

/**
 *  Makes what changes between runs hold still: the clock, and the tip on the workspace, which
 *  is chosen with Math.random - always the first one instead. Before the first navigation, so
 *  the page never sees the real ones.
 */
export async function holdStill(page: Page): Promise<void> {
    await page.clock.setFixedTime(FIXED_TIME);
    await page.addInitScript(() => { Math.random = () => 0; });
}

/**
 *  Opens the new tab page with the language and preferences in place and the "Load examples"
 *  set loaded - the way a new user reaches it, through the first-run page's button. The
 *  preferences are written first, so the page the button reloads is already drawn with them.
 *
 *  A curated demo set (an en and an sk dump of chrome.storage.local) is meant to replace the
 *  examples; it would be written here, in place of the click.
 */
export async function openWithExamples(
    page: Page,
    extensionId: string,
    language: string,
    preferences: StagePreferences
): Promise<void> {
    await page.goto(`chrome-extension://${extensionId}/index.html`);
    await page.evaluate(
        stored => chrome.storage.local.set({ device_preferences: stored }),
        { ...preferences, language });
    await page.reload();
    await Promise.all([
        page.waitForEvent("load"),
        page.click("#act-load-defaults"),
    ]);
    await page.waitForSelector("workspace-plane link-group");
}

/**
 *  Waits until the page has stopped changing: favicons arrive from the worker one by one, and
 *  the network falling quiet is not the same as them being drawn.
 */
export async function settle(page: Page): Promise<void> {
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);
}
