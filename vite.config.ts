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
                background: resolve(__dirname, "src/backend/workers/background.ts")
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
