import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 *  A contract on the stylesheets: the element a menu is about (`.has-open-menu`) looks hovered,
 *  so the mark has to weigh exactly what the hover does.
 *
 *  It once sat in a selector of its own, `link-group.has-open-menu`, which is lighter than the
 *  hover rule - and lighter than the selector aero draws a group's glass with. The hover still
 *  won there, the mark did not, and in aero a group stayed at rest while its menu was open.
 *  Written as one selector, `:is(:hover, .has-open-menu)`, the two cannot weigh differently.
 *  jsdom applies no stylesheet, so the rules themselves are checked.
 */
function selectorsMarkingTheOwner(file: string): string[] {
    const css = readFileSync(resolve("src/ui/styles", file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    return [...css.matchAll(/([^{}]+)\{[^}]*\}/g)]
        .flatMap(match => match[1].split(/,(?![^(]*\))/).map(selector => selector.trim()))
        .filter(selector => selector.includes("has-open-menu"));
}

describe("the look of an element whose menu is open", () => {

    it.each([
        ["group.css", "link-group"],
        ["subgroup.css", "link-subgroup"],
        ["link.css", "link-container"]
    ])("in %s, %s is marked in the same selector as its hover", (file, element) => {
        const selectors = selectorsMarkingTheOwner(file);

        expect(selectors.length).toBeGreaterThan(0);
        for (const selector of selectors) {
            expect(selector).toContain(`${element}:is(:hover, .has-open-menu)`);
        }
    });
});
