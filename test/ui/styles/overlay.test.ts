import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 *  The overlay is a fixed layer over the whole window with a backdrop-filter. Hidden by
 *  opacity and visibility alone, it stayed composited on top of everything, and every hover
 *  beneath it re-blurred the page behind it a frame late - artefacts from something invisible.
 *  Hidden has to take it out of rendering altogether.
 */
describe("the overlay", () => {

    const css = readFileSync(resolve("src/ui/styles/main.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const rule = (selector: string) =>
        new RegExp(`(?:^|})\\s*${selector.replace(/\./g, "\\.")}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? "";

    it("is display: none while hidden, not merely invisible", () => {
        expect(rule("div.overlay.hidden")).toMatch(/display\s*:\s*none/);
        expect(rule("div.overlay.hidden")).not.toMatch(/visibility\s*:/);
    });

    it("still fades in, from a starting opacity", () => {
        expect(css).toMatch(/@starting-style\s*\{\s*div\.overlay\s*\{\s*opacity\s*:\s*0/);
    });
});
