import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
    root: "src",
    publicDir: "../public",

    build: {
        outDir: "../dist",
        emptyOutDir: true,
        target: "es2020",

        rollupOptions: {
            input: {
                index: resolve(__dirname, "src/index.html"),
                main: resolve(__dirname, "src/main.ts"),
                // The bookmarking window: its own page, opened by the service worker when the
                // keyboard shortcut is pressed on some other site.
                bookmark: resolve(__dirname, "src/bookmark.html"),
                background: resolve(__dirname, "src/backend/worker/background.ts")
            },
            output: {
                entryFileNames: "[name].js"
            }
        }
    },

    optimizeDeps: {
        include: ["fast-deep-equal"]
    }
});
