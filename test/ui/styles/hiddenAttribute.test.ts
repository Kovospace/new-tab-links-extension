import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 *  A contract on the stylesheet, because nothing else here can check it.
 *
 *  main.css gives every div and span `display: block`, which in a browser beats the `hidden`
 *  attribute: elements the code hid stayed on screen, and the input dialog opened with every
 *  validation message showing. jsdom cannot reproduce that - it hides a `hidden` element
 *  whatever the stylesheets say - so a rendering test passes with or without the fix. What can
 *  be checked is that the rule restoring the attribute is still there.
 */
describe("main.css", () => {

    it("keeps the hidden attribute meaning display: none, above its own display rules", () => {
        const css = readFileSync(resolve("src/ui/styles/main.css"), "utf8");

        expect(css).toMatch(/\[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/);
    });
});
