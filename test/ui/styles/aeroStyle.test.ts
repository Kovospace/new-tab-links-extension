import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 *  A contract on the stylesheets for the theme style (#107). jsdom applies no stylesheet, so
 *  the rules themselves are checked: flat has to stay flat - no blur anywhere unless the root
 *  says aero, the search suggestions included - and aero has to reach what it promises.
 */
const STYLES = resolve("src/ui/styles");
const AERO = 'html[data-theme-style="aero"]';

/** Every rule across every stylesheet, as [selector, declarations]. */
function rules(): Array<[string, string]> {
    const found: Array<[string, string]> = [];
    for (const file of readdirSync(STYLES).filter(name => name.endsWith(".css"))) {
        const css = readFileSync(resolve(STYLES, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
        for (const match of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
            found.push([match[1].trim(), match[2]]);
        }
    }
    return found;
}

/**
 *  What dims the page behind a modal dialog. Not a surface the style is about: it blurred the
 *  page before there was a style, and it does in both.
 */
const MODAL_BACKDROPS = ["dialog.input-dialog::backdrop", "div.overlay"];

const blurring = () => rules().filter(([, body]) => /backdrop-filter\s*:/.test(body));

describe("the theme style in the stylesheets", () => {

    it("blurs nothing in the flat style", () => {
        const unguarded = blurring()
            .flatMap(([selector]) => selector.split(","))
            .map(selector => selector.trim())
            .filter(selector => !selector.startsWith(AERO) && !MODAL_BACKDROPS.includes(selector));

        expect(unguarded).toEqual([]);
    });

    it.each([
        "workspace-plane-body > link-group",
        "options-menu",
        "ul.search-bar__suggestions"
    ])("blurs %s in aero", element => {
        expect(blurring().map(([selector]) => selector)).toContain(`${AERO} ${element}`);
    });

    it("lifts the group whose menu is open above the next column", () => {
        const lift = rules().find(([selector]) =>
            selector === `${AERO} workspace-plane-body > link-group:has(options-menu.visible)`);

        expect(lift?.[1]).toMatch(/z-index\s*:\s*[1-9]/);
    });
});
