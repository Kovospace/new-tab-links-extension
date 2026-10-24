import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 *  A contract on the stylesheets for the theme style (#107). jsdom applies no stylesheet, so
 *  the rules themselves are checked: flat stays flat, aero reaches what it promises, every
 *  amount comes from the knobs in __variables.css, and nothing that holds a menu is blurred on
 *  itself.
 */
const STYLES = resolve("src/ui/styles");
/**
 *  `:root`, never `html`: the sheet is a shared chunk the page links before its own stylesheet,
 *  so its rules have to outrank the components' `html.dark ...` by specificity, not by order.
 */
const AERO = ':root[data-theme-style="aero"]';

/**
 *  What dims the page behind a modal dialog. Not a surface the style is about: it blurred the
 *  page before there was a style, and it does in both.
 */
const MODAL_BACKDROPS = ["dialog.input-dialog::backdrop", "div.overlay"];

function css(file: string): string {
    return readFileSync(resolve(STYLES, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Every rule across every stylesheet, as [selector, declarations]. */
function rules(): Array<[string, string]> {
    const found: Array<[string, string]> = [];
    for (const file of readdirSync(STYLES).filter(name => name.endsWith(".css"))) {
        for (const match of css(file).matchAll(/([^{}]+)\{([^}]*)\}/g)) {
            found.push([match[1].trim(), match[2]]);
        }
    }
    return found;
}

/** Each selector of every rule that blurs, one by one. */
const blurredSelectors = () => rules()
    .filter(([, body]) => /backdrop-filter\s*:/.test(body))
    .flatMap(([selector]) => selector.split(","))
    .map(selector => selector.trim());

describe("the theme style in the stylesheets", () => {

    it("writes every aero rule against :root, so it wins whatever order the sheets load in", () => {
        const aeroSelectors = css("_aero.css").match(/[^{}]+(?=\{)/g)!
            .flatMap(selector => selector.split(","))
            .map(selector => selector.trim());

        expect(aeroSelectors.filter(selector => !selector.startsWith(AERO))).toEqual([]);
    });

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
        "options-menu",
        "ul.search-bar__suggestions",
        "dialog.input-dialog"
    ])("blurs %s in aero", element => {
        expect(blurredSelectors()).toContain(`${AERO} ${element}`);
    });

    /**
     *  backdrop-filter makes an element a stacking context, and a menu inside one can rise no
     *  higher than it: under the next column, or under the overlay shown while a menu is open.
     */
    it.each(["header", "workspace-plane-body > link-group", "link-subgroup"])(
        "never blurs %s itself, which holds menus", element => {
            const onItself = blurredSelectors().filter(selector =>
                selector.startsWith(AERO) && !selector.includes("::")
                && selector.replace(AERO, "").trim().replace(/:hover$/, "") === element);

            expect(onItself).toEqual([]);
        });

    /**
     *  A blur that exists only under the pointer is built and dropped by Chrome on every hover,
     *  and a frame drawn before the layer is ready flickers. Hover may change a tint, never
     *  whether something is blurred.
     */
    it("never turns a blur on or off with the pointer", () => {
        expect(blurredSelectors().filter(selector => selector.includes(":hover"))).toEqual([]);
    });

    /**
     *  Without a layer of its own, a blurred menu or panel was drawn unblurred for one frame
     *  whenever a hover transition inside it ended - a flicker after every hover.
     */
    it("gives every blur in aero a layer of its own", () => {
        const withoutLayer = rules()
            .filter(([selector, body]) => selector.startsWith(AERO) && /backdrop-filter\s*:/.test(body))
            .filter(([, body]) => !/transform:\s*translateZ\(0\)/.test(body))
            .map(([selector]) => selector);

        expect(withoutLayer).toEqual([]);
    });

    it("takes every amount from the knobs in __variables.css", () => {
        const knobs = css("__variables.css");
        for (const knob of ["--aero-opacity", "--aero-menu-opacity", "--aero-blur"]) {
            expect(knobs).toMatch(new RegExp(`${knob}:\\s*[^;]+;`));
        }
        // No number written into the rules themselves: a percentage or a blur radius there is
        // a knob somebody would look for in __variables.css and not find.
        const aero = css("_aero.css");
        expect(aero).not.toMatch(/\d+%|blur\(\d/);
    });
});
