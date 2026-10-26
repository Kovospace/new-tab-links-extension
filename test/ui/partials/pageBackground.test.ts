import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { objectUrlAddress, PageBackground, PictureAddress } from "../../../src/ui/partials/pageBackground";
import { ObservableValue } from "../../../src/utils/observableValue";

/**
 *  The user's own picture is painted on a fixed layer of its own, never as the root's
 *  background with background-attachment: fixed. Chrome cannot give that a layer: the picture
 *  behind every hover was painted again, at a lower quality while the hover animated and at full
 *  quality once it stopped - a flash at the end of every hover, in either theme style.
 */
describe("PageBackground, the user's own picture", () => {

    let background: PageBackground;
    let picture$: ObservableValue<string | null>;
    let handedOut: string[];
    let released: string[];
    const root = document.documentElement;

    /** Stands in for URL.createObjectURL, which jsdom does not have. */
    const fakeAddress: PictureAddress = {
        of: () => { const address = `blob:fake-${handedOut.length + 1}`; handedOut.push(address); return address; },
        release: address => { released.push(address); }
    };

    beforeEach(() => { handedOut = []; released = []; });
    afterEach(() => background.dispose());

    function render(picture: string | null): void {
        picture$ = new ObservableValue<string | null>(picture);
        background = new PageBackground(picture$, fakeAddress);
        background.render();
    }

    it("hands the picture to the stylesheet, not to the root's own background", () => {
        render("data:image/png;base64,AAAA");

        expect(root.classList.contains("has-custom-background")).toBe(true);
        expect(root.style.getPropertyValue("--page-background-image")).toBe('url("blob:fake-1")');
        expect(root.style.backgroundImage).toBe("");
    });

    /**
     *  Chromium silently refuses a custom property value of about two megabytes or more, and a 4K
     *  picture is a data URL of two to four: the large built-in backgrounds were stored and never
     *  drawn. Only a short address may go into the property.
     */
    it("never puts the picture itself into the custom property, however large it is", () => {
        render("data:image/webp;base64," + "A".repeat(3 * 1024 * 1024));

        const value = root.style.getPropertyValue("--page-background-image");
        expect(value).not.toContain("data:");
        expect(value.length).toBeLessThan(100);
    });

    it("releases the address of a picture no longer shown", () => {
        render("data:image/png;base64,AAAA");
        picture$.set("data:image/png;base64,BBBB");
        picture$.set(null);

        expect(released).toEqual(["blob:fake-1", "blob:fake-2"]);
    });

    it("has nothing to show once the picture is removed", () => {
        render(null);

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

describe("objectUrlAddress", () => {

    it("decodes a base64 data URL into a Blob of its type, and hands out its address", async () => {
        let made: Blob | null = null;
        vi.stubGlobal("URL", Object.assign(URL, {
            createObjectURL: (blob: Blob) => { made = blob; return "blob:made"; },
            revokeObjectURL: () => undefined
        }));

        expect(objectUrlAddress.of("data:image/webp;base64," + btoa("RIFF1234WEBP"))).toBe("blob:made");
        expect(made!.type).toBe("image/webp");
        expect(await made!.text()).toBe("RIFF1234WEBP");
        vi.unstubAllGlobals();
    });
});
