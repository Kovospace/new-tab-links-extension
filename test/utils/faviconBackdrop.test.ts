import { describe, expect, it } from "vitest";

import { backdropFor, contrastRatio, hslLuminance, relativeLuminance } from "../../src/utils/faviconBackdrop";

/** An icon of `count` pixels of one colour, as a canvas reports them. */
function pixels(count: number, red: number, green: number, blue: number, alpha = 255): number[] {
    return Array.from({ length: count }, () => [red, green, blue, alpha]).flat();
}

const icon = (...parts: number[][]) => new Uint8ClampedArray(parts.flat());

/**
 *  A round 16 x 16 icon on a transparent square, as most favicons are: `ring` is its outer part,
 *  what the disc touches; `inside`, if given, its middle, which the disc never touches.
 */
function roundIcon(ring: number[], inside?: number[]): Uint8ClampedArray {
    return new Uint8ClampedArray(Array.from({ length: 256 }, (_, index) => {
        const distance = Math.hypot(index % 16 - 7.5, Math.floor(index / 16) - 7.5);
        if (distance > 7.5) return [0, 0, 0, 0];
        return [...(inside && distance < 4 ? inside : ring), 255];
    }).flat());
}

const HSL = /hsl\((\d+) (\d+)% (\d+)%\)/;
const PAIR = new RegExp(`^light-dark\\(${HSL.source}, ${HSL.source}\\)$`);

/** The disc for one theme, out of the "light-dark(hsl(h s% l%), hsl(h s% l%))" pair. */
function disc(colour: string | null, theme: "light" | "dark"): [number, number, number] {
    const match = PAIR.exec(colour ?? "");
    expect(match, `${colour}`).not.toBeNull();
    const at = theme === "light" ? 1 : 4;
    return [Number(match![at]), Number(match![at + 1]), Number(match![at + 2])];
}

/** The contrast between a disc and the colour of the icon's outline. */
function contrast(colour: string | null, theme: "light" | "dark", outline: number[]): number {
    const [hue, saturation, lightness] = disc(colour, theme);
    return contrastRatio(
        relativeLuminance(outline[0] / 255, outline[1] / 255, outline[2] / 255),
        hslLuminance(hue, saturation, lightness));
}

const THEMES = ["light", "dark"] as const;

/**
 *  Each favicon's disc (#132): the icon's dominant hue, calmed, at a lightness chosen for
 *  contrast with the icon's outline - per theme, as quiet as that contrast allows.
 */
describe("backdropFor", () => {

    describe("contrast with what the disc touches", () => {

        it.each([
            ["white", [255, 255, 255]],
            ["black", [0, 0, 0]],
            ["mid grey", [128, 128, 128]],
            ["red", [255, 0, 0]],
            ["yellow", [250, 220, 20]],
            ["blue", [0, 79, 255]]
        ])("gives a %s icon a disc of at least 3:1 in both themes", (_, colour) => {
            const backdrop = backdropFor(roundIcon(colour));
            for (const theme of THEMES) {
                expect(contrast(backdrop, theme, colour)).toBeGreaterThanOrEqual(3);
            }
        });

        it("measures Spotify's green ring, not the black logo inside it", () => {
            // The bug: the average said "dark" for a green right at the middle, so the disc came
            // out light grey - about as bright as the green, 1.4:1, and the icon disappeared.
            const green = [30, 215, 96];
            const backdrop = backdropFor(roundIcon(green, [0, 0, 0]));
            for (const theme of THEMES) {
                expect(contrast(backdrop, theme, green)).toBeGreaterThanOrEqual(3);
            }
        });

        it("takes the image's edge as the outline of an icon with no transparency", () => {
            const white = [255, 255, 255];
            const backdrop = backdropFor(icon(pixels(256, 255, 255, 255)));
            expect(contrast(backdrop, "light", white)).toBeGreaterThanOrEqual(3);
        });
    });

    describe("per theme", () => {

        const white = () => backdropFor(roundIcon([255, 255, 255]));
        const black = () => backdropFor(roundIcon([0, 0, 0]));

        it("is a light-dark() pair, so the browser switches it with the theme", () => {
            expect(white()).toMatch(PAIR);
        });

        it("stays close to the theme's background when the contrast allows it", () => {
            // A black icon on the light page and a white one on the dark page need no help.
            expect(disc(black(), "light")[2]).toBeGreaterThanOrEqual(80);
            expect(disc(white(), "dark")[2]).toBeLessThanOrEqual(25);
        });

        it("moves only as far as the contrast needs, not to the far end", () => {
            // A white icon on the light page: dark enough to show it, not a black blob.
            expect(disc(white(), "light")[2]).toBeGreaterThan(40);
            expect(disc(white(), "light")[2]).toBeLessThan(70);
            // A black icon on the dark page: light enough to show it, not a glaring white disc.
            expect(disc(black(), "dark")[2]).toBeGreaterThan(25);
            expect(disc(black(), "dark")[2]).toBeLessThan(50);
        });

        it("keeps the icon's hue in both", () => {
            const red = backdropFor(roundIcon([230, 20, 20]));
            expect(disc(red, "dark")[0]).toBe(disc(red, "light")[0]);
            expect(disc(red, "dark")[1]).toBe(disc(red, "light")[1]);
        });
    });

    describe("hue", () => {

        it("puts an icon with no colour of its own on a neutral disc", () => {
            expect(disc(backdropFor(roundIcon([255, 255, 255])), "light")[1]).toBe(0);
            expect(disc(backdropFor(roundIcon([0, 0, 0])), "light")[1]).toBe(0);
        });

        it("gives a red icon a calm red disc", () => {
            const [hue, saturation] = disc(backdropFor(icon(pixels(256, 230, 20, 20))), "light");
            expect(Math.min(hue, 360 - hue)).toBeLessThan(15);
            expect(saturation).toBeGreaterThan(0);
            expect(saturation).toBeLessThan(40);
        });

        it("gives a yellow icon a disc of its own hue", () => {
            const [hue] = disc(backdropFor(icon(pixels(256, 250, 220, 20))), "light");
            expect(hue).toBeGreaterThan(40);
            expect(hue).toBeLessThan(70);
        });

        it("follows the colour most of the icon is, ignoring the transparent surround", () => {
            const [hue] = disc(backdropFor(icon(pixels(200, 0, 0, 0, 0), pixels(56, 30, 90, 230))), "light");
            expect(hue).toBeGreaterThan(200);
            expect(hue).toBeLessThan(240);
        });

        it("averages hues across red's wrap-around as red, not as the opposite colour", () => {
            // 355° and 5° in the same bin of votes: averaged as numbers they would be 180°, cyan.
            const [hue] = disc(backdropFor(icon(pixels(128, 255, 0, 22), pixels(128, 255, 22, 0))), "light");
            expect(Math.min(hue, 360 - hue)).toBeLessThan(15);
        });

        it("does not call an icon coloured for a few stray pixels", () => {
            const [, saturation] = disc(backdropFor(icon(pixels(250, 0, 0, 0), pixels(6, 255, 0, 0))), "light");
            expect(saturation).toBe(0);
        });
    });

    it("has nothing to say about an icon with no opaque pixel", () => {
        expect(backdropFor(icon(pixels(256, 255, 0, 0, 0)))).toBeNull();
    });
});
