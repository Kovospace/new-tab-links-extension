import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 *  A contract on the stylesheets: favicons are sized in rem, so they follow the size setting.
 *
 *  The setting is the root font size. A favicon sized by its img's width and height attributes,
 *  or by a rule in px, stays the same while everything around it grows or shrinks. jsdom lays
 *  nothing out, so what can be checked is the rule itself.
 */
function ruleFor(file: string, selector: string): string {
    const css = readFileSync(resolve("src/ui/styles", file), "utf8");
    const start = css.indexOf(`${selector} {`);
    expect(start, `${selector} in ${file}`).toBeGreaterThanOrEqual(0);
    return css.slice(start, css.indexOf("}", start));
}

describe("favicon sizes", () => {

    it.each([
        ["link.css", "link-container > div.cls-link-icon > img"],
        ["_closedTabs.css", ".closed-tabs__favicon"],
        ["_bookmarkPanel.css", ".bookmark-panel__icon > img"],
    ])("%s sizes %s in rem", (file, selector) => {
        const rule = ruleFor(file, selector);

        expect(rule).toMatch(/width:\s*[\d.]+rem/);
        expect(rule).toMatch(/height:\s*[\d.]+rem/);
    });
});
