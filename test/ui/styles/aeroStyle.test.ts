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

/** Each selector of every blurring rule, one by one. */
const blurredSelectors = () => blurring()
    .flatMap(([selector]) => selector.split(","))
    .map(selector => selector.trim());

describe("the theme style in the stylesheets", () => {

    it("blurs nothing in the flat style", () => {
        const unguarded = blurredSelectors()
            .filter(selector => !selector.startsWith(AERO) && !MODAL_BACKDROPS.includes(selector));

        expect(unguarded).toEqual([]);
    });

    it.each([
        "header::before",
        "footer",
        ".closed-tabs",
        ".tips-bar",
        "workspace-plane-body > link-group::before",
        "link-subgroup:hover::before",
        "options-menu",
        "ul.search-bar__suggestions",
        "ul.search-bar__engines",
        "dialog.input-dialog"
    ])("blurs %s in aero", element => {
        expect(blurredSelectors()).toContain(`${AERO} ${element}`);
    });

    /**
     *  backdrop-filter makes an element a stacking context, and a menu inside one can rise no
     *  higher than it: under the next column, or under the overlay that is shown while a menu is
     *  open. What holds menus is blurred from a layer behind it, never on itself.
     */
    it.each(["header", "workspace-plane-body > link-group", "link-subgroup"])(
        "never blurs %s itself, which holds menus", element => {
            const onItself = blurredSelectors().filter(selector =>
                selector.startsWith(AERO) && !selector.includes("::")
                && selector.replace(AERO, "").trim().replace(/:hover$/, "") === element);

            expect(onItself).toEqual([]);
        });

    it("keeps the frames the document's colour, only see-through", () => {
        const root = rules().find(([selector]) => selector === AERO)!;

        expect(root[1]).toMatch(/--aero-frame:\s*color-mix\(in srgb, var\(--color-document-background\)/);
    });
});
