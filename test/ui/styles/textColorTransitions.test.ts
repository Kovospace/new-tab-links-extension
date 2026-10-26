import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 *  Text colour is never animated (the note on `button` in main.css). A colour transition
 *  redraws the text on every frame, and Chrome draws text one way while it keeps being
 *  repainted and another once it settles: the switch at the end of every hover was a flicker of
 *  the text. A hover may still change the colour - in one step, a 0s transition, which may be
 *  delayed so the text switches halfway through the background's fade.
 */
describe("transitions in the stylesheets", () => {

    it("never animate the text colour, only step it", () => {
        const styles = resolve("src/ui/styles");
        const offending: string[] = [];
        for (const file of readdirSync(styles).filter(name => name.endsWith(".css"))) {
            const css = readFileSync(resolve(styles, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
            for (const match of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
                const transition = /(?:^|;)\s*transition(?:-property)?\s*:([^;]*)/.exec(match[2])?.[1] ?? "";
                // Split on the commas between transitions, not those inside calc() or var().
                const parts = transition.split(/,(?![^(]*\))/).map(part => part.trim());
                const animated = parts.filter(part =>
                    /^(color|all)\b/.test(part) && !/^(color|all)\s+0s\b/.test(part));
                if (animated.length > 0) {
                    offending.push(`${file}: ${match[1].trim()}`);
                }
            }
        }

        expect(offending).toEqual([]);
    });
});
