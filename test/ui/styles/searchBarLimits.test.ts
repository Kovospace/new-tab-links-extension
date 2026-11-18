import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 *  #198: the search bar keeps between 16em and 48em, and the workspace head it sits in fits
 *  the window beside the side panel - beside the open panel while it is open, by the pointer
 *  or kept open. Fitted beside
 *  the rail alone, a kept-open panel pushed the head 74 to 306 pixels past the window's edge
 *  (measured at 1280 to 640 wide) and the page scrolled sideways. jsdom lays nothing out, so the
 *  rules are checked; the widths were measured in Chromium.
 */
function declarationsOf(file: string, selector: string): string {
    const css = readFileSync(resolve(file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const rule = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].find(match => match[1].trim() === selector);
    if (!rule) throw new Error(`no rule for ${selector} in ${file}`);
    return rule[2];
}

describe("the search bar's limits", () => {

    it("keeps between 16em and 48em", () => {
        const wrapper = declarationsOf("src/ui/styles/_searchBar.css", "div.search-bar-wrapper");
        expect(wrapper).toMatch(/min-width:\s*min\(16em,/);
        expect(wrapper).toMatch(/max-width:\s*48em;/);
    });

    it("fits the head beside the rail, its margin included", () => {
        expect(declarationsOf("src/ui/styles/workspace.css", "workspace-plane-head"))
            .toMatch(/max-width:\s*calc\(100vw - var\(--widgets-spacing\) - var\(--closed-tabs-rail\) - 2em\)/);
    });

    it("fits the head beside the open panel while the panel is open, kept open or hovered", () => {
        expect(declarationsOf("src/ui/styles/workspace.css",
            ":root:has(aside.closed-tabs:is(.closed-tabs--open, .closed-tabs--kept-open)) workspace-plane-head"))
            .toMatch(/max-width:\s*calc\(100vw - var\(--widgets-spacing\) - var\(--closed-tabs-open\) - 2em\)/);
    });

    it("is told by the panel when it is kept open", () => {
        const panel = readFileSync(resolve("src/ui/partials/closedTabsPanel.ts"), "utf8");
        expect(panel).toMatch(/classList\.toggle\('closed-tabs--kept-open', keep\)/);
    });
});
