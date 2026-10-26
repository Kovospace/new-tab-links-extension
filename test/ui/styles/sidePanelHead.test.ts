import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 *  A contract on the side panel's stylesheet (#137): opening the panel must not move its list.
 *
 *  The head's title and buttons, the card switcher and the search field used to be
 *  `display: none` while the rail was folded and shown once it opened - so the list started
 *  35 to 73 pixels lower open than folded, and the row the pointer was reaching for slid away
 *  from under it as the panel widened. Folded, they are now laid out and only invisible, and
 *  the list stays put. jsdom lays nothing out, so the rules themselves are checked.
 */
const ABOVE_THE_LIST = [
    ".closed-tabs__title",
    ".closed-tabs__head-action",
    ".closed-tabs__keep-open",
    ".closed-tabs__cards",
    ".closed-tabs__search"
];

/** Every rule of the panel's stylesheet, as [selector, declarations]. */
function rules(): Array<[string, string]> {
    const css = readFileSync(resolve("src/ui/styles/_closedTabs.css"), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "");
    return [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(match => [match[1].trim(), match[2]]);
}

describe("the side panel's head while the rail is folded", () => {

    it.each(ABOVE_THE_LIST)("lays out %s whether the panel is open or not", element => {
        const decidedByOpening = rules().filter(([selector, declarations]) =>
            selector.includes(element)
            && selector.includes("closed-tabs--open")
            && /(^|;)\s*display\s*:/.test(declarations));
        expect(decidedByOpening.map(([selector]) => selector)).toEqual([]);
    });

    it.each(ABOVE_THE_LIST)("hides %s by visibility while folded", element => {
        const folded = rules().find(([selector, declarations]) =>
            selector.includes(".closed-tabs:not(.closed-tabs--open)")
            && selector.includes(element)
            && /visibility\s*:\s*hidden/.test(declarations));
        expect(folded).toBeDefined();
    });
});
