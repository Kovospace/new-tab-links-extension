import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 *  #202: the ads bar is only as wide as the banner in it - and its lining - and never wider
 *  than the window. It used to stretch across the whole footer around a 728px banner. jsdom
 *  lays nothing out, so the rules are checked.
 */
function declarationsOf(selector: string): string {
    const css = readFileSync(resolve("src/ui/styles/_adsBar.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const rule = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].find(match => match[1].trim() === selector);
    if (!rule) throw new Error(`no rule for ${selector}`);
    return rule[2];
}

describe("the ads bar's width", () => {

    it("is the banner's and its lining's, capped at the window", () => {
        const bar = declarationsOf(".ads-bar");
        expect(bar).toMatch(/width:\s*calc\(var\(--ads-slot-width\) \+ 2 \* var\(--border-lining-width-inset\)\);/);
        expect(bar).toMatch(/max-width:\s*100%;/);
        expect(bar).not.toMatch(/(^|;)\s*width:\s*100%/);
    });

    it("shares the banner's width with the page in it", () => {
        expect(declarationsOf(".ads-bar")).toMatch(/--ads-slot-width:\s*728px;/);
        expect(declarationsOf(".ads-bar__frame")).toMatch(/width:\s*var\(--ads-slot-width\);/);
    });
});
