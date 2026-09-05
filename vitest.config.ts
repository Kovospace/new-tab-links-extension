import { defineConfig } from "vitest/config";

/**
 *  Test configuration, deliberately separate from vite.config.ts.
 *
 *  That file sets `root: "src"` so the extension builds from there, and inheriting it would
 *  make every path in here relative to a directory the tests do not live under. The build and
 *  the tests want different roots, so they get different files rather than one with conditions
 *  in it.
 */
export default defineConfig({
    test: {
        // Most of what is worth testing is pure - merge rules, change sets, identifier
        // rewriting - but the repositories reach for chrome.storage and window.setTimeout, so
        // the suite runs in a DOM. Cheaper than splitting the suite in two.
        environment: "jsdom",
        include: ["src/**/*.test.ts"],
        setupFiles: ["src/test/chromeStorageStub.ts"],
        restoreMocks: true
    }
});
