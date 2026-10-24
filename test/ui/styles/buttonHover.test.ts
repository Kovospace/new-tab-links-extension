import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 *  The page-wide hover of every button must lose to a component's own hover. It used to carry a
 *  bare :not(:disabled), which weighed a class more and painted the active history card, the
 *  history day headings and the settings section headings grey under the pointer.
 */

/** Specificity as [classes, elements]; ids are not used in these stylesheets. */
function specificity(selector: string): [number, number] {
    const plain = selector
        .replace(/:where\([^)]*\)/g, "")
        .replace(/:not\(([^)]*)\)/g, " $1")
        .replace(/::[\w-]+/g, "");
    const classes = (plain.match(/\.[\w-]+|\[[^\]]*\]|:[\w-]+/g) ?? []).length;
    const elements = (plain.match(/(?:^|[\s>+~])[a-zA-Z][\w-]*/g) ?? []).length;
    return [classes, elements];
}

const beats = (first: [number, number], second: [number, number]) =>
    first[0] > second[0] || (first[0] === second[0] && first[1] > second[1]);

const css = (file: string) =>
    readFileSync(resolve("src/ui/styles", file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** The page-wide hover rule for buttons, as written in main.css. */
function globalHover(): string {
    const match = /(html\.dark button:hover[^{,]*)\{/.exec(css("main.css"));
    return match![1].trim();
}

describe("the page-wide button hover", () => {

    it("still beats a button at rest", () => {
        expect(beats(specificity(globalHover()), specificity("html.dark button"))).toBe(true);
    });

    it.each([
        ['_closedTabs.css', '.closed-tabs__card[aria-pressed="true"]:hover'],
        ['_closedTabs.css', 'html.dark .closed-tabs__day-toggle:hover'],
        ['_closedTabs.css', 'html.dark .closed-tabs__text:hover'],
        ['_settingsDialog.css', 'html.dark .settings-dialog__category-head:hover'],
        ['main.css', 'html.dark .active:hover']
    ])("loses to %s %s", (file, selector) => {
        expect(css(file)).toContain(selector);
        expect(beats(specificity(selector), specificity(globalHover()))).toBe(true);
    });
});
