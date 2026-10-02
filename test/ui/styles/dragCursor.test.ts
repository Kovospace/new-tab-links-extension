import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 *  A contract on the stylesheets: the grab cursor is never put on something a click acts on.
 *
 *  A link opens when clicked and a subgroup's heading folds it, yet both wore "grab" because
 *  they can also be dragged - so everywhere on a link but the bare text of its anchor said
 *  "this does not open". jsdom applies no stylesheet, so the rules themselves are checked.
 */
const STYLES = resolve("src/ui/styles");

/** Every selector, across every stylesheet, whose rule sets a grab or grabbing cursor. */
function selectorsWithGrab(): string[] {
    const selectors: string[] = [];
    for (const file of readdirSync(STYLES).filter(name => name.endsWith(".css"))) {
        const css = readFileSync(resolve(STYLES, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
        for (const match of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
            if (/cursor:\s*grab/.test(match[2])) {
                selectors.push(match[1].trim());
            }
        }
    }
    return selectors;
}

describe("drag cursors", () => {

    it.each(["link-container", "link-subgroup-head"])("never puts grab on %s", element => {
        const offending = selectorsWithGrab().filter(selector =>
            new RegExp(`(^|[\\s>+~,])${element}(?![\\w-])[^\\s>+~,]*\\s*$`).test(selector));

        expect(offending).toEqual([]);
    });

    it("still puts it on a group's heading, which a click does nothing to", () => {
        expect(selectorsWithGrab()).toContain('link-group[draggable="true"] > link-group-head');
    });
});
