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
        // Tests live in test/, mirroring src/ - the shape a Java project has, and the
        // reason is the same: what ships and what proves it are different things, and a
        // bundler that is told to build "src" should not have to be told which files in it
        // are not really there.
        include: ["test/**/*.test.ts"],
        setupFiles: ["test/support/chromeStorageStub.ts"],
        restoreMocks: true
    }
});
