import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 *  Text colour is never animated (the note on `button` in main.css). A colour transition
 *  redraws the text on every frame, and Chrome draws text one way while it keeps being
 *  repainted and another once it settles: the switch at the end of every hover was a flicker of
 *  the text. A hover may still change the colour - at once, while the background fades.
 */
describe("transitions in the stylesheets", () => {

    it("never animate the text colour", () => {
        const styles = resolve("src/ui/styles");
        const offending: string[] = [];
        for (const file of readdirSync(styles).filter(name => name.endsWith(".css"))) {
            const css = readFileSync(resolve(styles, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
            for (const match of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
                const transition = /(?:^|;)\s*transition(?:-property)?\s*:([^;]*)/.exec(match[2])?.[1] ?? "";
                if (/(^|[\s,])(color|all)(\s|,|$)/.test(transition)) {
                    offending.push(`${file}: ${match[1].trim()}`);
                }
            }
        }

        expect(offending).toEqual([]);
    });
});
