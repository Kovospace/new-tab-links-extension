import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { followFaviconBackdrop } from "../../src/utils/faviconBackdrop";

/**
 *  An SVG favicon can draw itself per theme - ChatGPT's is black on light and white on dark - and
 *  its disc, worked out from one drawing, used to stay right for that theme only until the page
 *  was reloaded. jsdom has no canvas, so one is stood in that draws the icon as the browser does
 *  such an SVG: black in the light theme, white in the dark one. The prototype is patched, which
 *  is safe only because vitest gives every test file its own environment.
 */
describe("a favicon that draws itself per theme", () => {

    const theme = (name: "light" | "dark") => { document.documentElement.dataset.theme = name; };
    const frames = () => new Promise(resolve => setTimeout(resolve, 100));

    beforeEach(() => {
        theme("light");
        const drawnFor = (current: string | undefined) => current === "dark" ? 255 : 0;
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((() => ({
            drawImage: () => undefined,
            getImageData: (_x: number, _y: number, width: number, height: number) => {
                const shade = drawnFor(document.documentElement.dataset.theme);
                const data = new Uint8ClampedArray(width * height * 4);
                for (let index = 0; index < data.length; index += 4) {
                    data.set([shade, shade, shade, 255], index);
                }
                return { data };
            }
        })) as unknown as typeof HTMLCanvasElement.prototype.getContext);
    });

    afterEach(() => vi.restoreAllMocks());

    function icon(src: string): HTMLImageElement {
        const img = document.createElement("img");
        Object.defineProperty(img, "complete", { value: true });
        Object.defineProperty(img, "naturalWidth", { value: 16 });
        img.src = src;
        document.body.appendChild(img);
        followFaviconBackdrop(img);
        return img;
    }

    /** The lightness of the disc the theme in effect draws: the half of the pair it picks. */
    function discLightness(img: HTMLImageElement, which: "light" | "dark"): number {
        const pair = /light-dark\(hsl\(\d+ \d+% (\d+)%\), hsl\(\d+ \d+% (\d+)%\)\)/
            .exec(img.style.getPropertyValue("--favicon-backdrop"))!;
        return Number(pair[which === "light" ? 1 : 2]);
    }

    it("works its disc out again when the theme changes, from the icon as drawn now", async () => {
        const img = icon("data:image/svg+xml;base64,PHN2Zy8+");
        // Light theme, black icon: a light disc.
        expect(discLightness(img, "light")).toBeGreaterThan(50);

        theme("dark");
        await frames();

        // Dark theme, the icon now white: the dark theme's disc has to be dark to show it.
        expect(discLightness(img, "dark")).toBeLessThan(30);
    });

    it("leaves a bitmap alone - it looks the same in both themes", async () => {
        const img = icon("chrome-extension://id/icon.png");
        const before = img.style.getPropertyValue("--favicon-backdrop");

        theme("dark");
        await frames();

        expect(img.style.getPropertyValue("--favicon-backdrop")).toBe(before);
    });
});
