import { defineConfig } from "@playwright/test";
import type { ShotOptions } from "./support/test";

/**
 *  Playwright runs the screenshot scenes, not tests (#129) - its runner is used for what it
 *  brings with it: TypeScript without a build step, one project per language, and a trace and
 *  a UI mode to see what a scene did. Vitest runs the tests and never looks in here.
 *
 *      npm run screenshots                  build, then render every scene in every language
 *      npx playwright test -c screenshots --ui      the same, watched step by step
 */
export default defineConfig<ShotOptions>({
    testDir: ".",
    testMatch: "**/*.shots.ts",
    outputDir: "out/.results",
    // One Chromium at a time: each loads the extension into a profile of its own anyway,
    // and parallel ones only race for the CPU the favicons and fonts are drawn with.
    workers: 1,
    reporter: "list",
    timeout: 60_000,
    use: {
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1,
        colorScheme: "dark",
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
    },
    projects: [
        { name: "en", use: { language: "en", locale: "en-US" } },
        { name: "sk", use: { language: "sk", locale: "sk-SK" } },
    ],
});
