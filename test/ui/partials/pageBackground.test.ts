import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { PageBackground } from "../../../src/ui/partials/pageBackground";
import { ObservableValue } from "../../../src/utils/observableValue";

/**
 *  A premium user's own picture is painted on a fixed layer of its own, never as the root's
 *  background with background-attachment: fixed. Chrome cannot give that a layer: the picture
 *  behind every hover was painted again, at a lower quality while the hover animated and at full
 *  quality once it stopped - a flash at the end of every hover, in either theme style.
 */
describe("PageBackground, the user's own picture", () => {

    let background: PageBackground;
    const root = document.documentElement;

    afterEach(() => background.dispose());

    function render(premium: boolean, picture: string | null): void {
        background = new PageBackground(
            new ObservableValue<boolean>(premium), new ObservableValue<string | null>(picture));
        background.render(document.body);
    }

    it("hands the picture to the stylesheet, not to the root's own background", () => {
        render(true, "data:image/png;base64,AAAA");

        expect(root.classList.contains("has-custom-background")).toBe(true);
        expect(root.style.getPropertyValue("--page-background-image"))
            .toBe('url("data:image/png;base64,AAAA")');
        expect(root.style.backgroundImage).toBe("");
    });

    it("shows it on a free account too, keeping the FREE badge", () => {
        render(false, "data:image/png;base64,AAAA");

        expect(root.classList.contains("has-custom-background")).toBe(true);
        expect(root.style.getPropertyValue("--page-background-image"))
            .toBe('url("data:image/png;base64,AAAA")');
        expect(document.querySelector(".page-watermark")!.getAttribute("data-tier")).toBe("free");
    });

    it("has nothing to show once the picture is removed", () => {
        render(true, null);

        expect(root.classList.contains("has-custom-background")).toBe(false);
        expect(root.style.getPropertyValue("--page-background-image")).toBe("");
    });

    it("is never a fixed background in any stylesheet", () => {
        const styles = resolve("src/ui/styles");
        const fixed = readdirSync(styles)
            .filter(name => name.endsWith(".css"))
            .filter(name => /background-attachment\s*:\s*fixed/.test(
                readFileSync(resolve(styles, name), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")));

        expect(fixed).toEqual([]);
    });
});
