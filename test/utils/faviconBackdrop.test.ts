import { describe, expect, it } from "vitest";

import { backdropFor } from "../../src/utils/faviconBackdrop";

/** An icon of `count` pixels of one colour, as a canvas reports them. */
function pixels(count: number, red: number, green: number, blue: number, alpha = 255): number[] {
    return Array.from({ length: count }, () => [red, green, blue, alpha]).flat();
}

const icon = (...parts: number[][]) => new Uint8ClampedArray(parts.flat());

const HSL = /hsl\((\d+) (\d+)% (\d+)%\)/;
const PAIR = new RegExp(`^light-dark\\(${HSL.source}, ${HSL.source}\\)$`);

/** The disc for one theme, out of the "light-dark(hsl(h s% l%), hsl(h s% l%))" pair. */
function disc(colour: string | null, theme: "light" | "dark"): [number, number, number] {
    const match = PAIR.exec(colour ?? "");
    expect(match, `${colour}`).not.toBeNull();
    const at = theme === "light" ? 1 : 4;
    return [Number(match![at]), Number(match![at + 1]), Number(match![at + 2])];
}

/** The light theme's disc, which the cases below were written for. */
const hsl = (colour: string | null) => disc(colour, "light");

/**
 *  Each favicon's disc (#132): the icon's dominant hue, calmed, and a lightness opposite to the
 *  icon's - a dark disc behind a light icon, a light one behind a dark icon.
 */
describe("backdropFor", () => {

    it("puts a white icon on a dark, neutral disc", () => {
        const [, saturation, lightness] = hsl(backdropFor(icon(pixels(256, 255, 255, 255))));
        expect(saturation).toBe(0);
        expect(lightness).toBeLessThan(40);
    });

    it("puts a black icon on a light, neutral disc", () => {
        const [, saturation, lightness] = hsl(backdropFor(icon(pixels(256, 0, 0, 0))));
        expect(saturation).toBe(0);
        expect(lightness).toBeGreaterThan(70);
    });

    it("gives a red icon a calm red disc, light because red is dark", () => {
        const [hue, saturation, lightness] = hsl(backdropFor(icon(pixels(256, 230, 20, 20))));
        expect(Math.min(hue, 360 - hue)).toBeLessThan(15);
        expect(saturation).toBeGreaterThan(0);
        expect(saturation).toBeLessThan(40);
        expect(lightness).toBeGreaterThan(70);
    });

    it("gives a yellow icon a dark disc of its own hue, because yellow is light", () => {
        const [hue, , lightness] = hsl(backdropFor(icon(pixels(256, 250, 220, 20))));
        expect(hue).toBeGreaterThan(40);
        expect(hue).toBeLessThan(70);
        expect(lightness).toBeLessThan(40);
    });

    it("follows the colour most of the icon is, ignoring the transparent surround", () => {
        const [hue] = hsl(backdropFor(icon(pixels(200, 0, 0, 0, 0), pixels(56, 30, 90, 230))));
        expect(hue).toBeGreaterThan(200);
        expect(hue).toBeLessThan(240);
    });

    it("averages hues across red's wrap-around as red, not as the opposite colour", () => {
        // 355° and 5° in the same bin of votes: averaged as numbers they would be 180°, cyan.
        const [hue] = hsl(backdropFor(icon(pixels(128, 255, 0, 22), pixels(128, 255, 22, 0))));
        expect(Math.min(hue, 360 - hue)).toBeLessThan(15);
    });

    it("does not call an icon coloured for a few stray pixels", () => {
        const [, saturation] = hsl(backdropFor(icon(pixels(250, 0, 0, 0), pixels(6, 255, 0, 0))));
        expect(saturation).toBe(0);
    });

    it("has nothing to say about an icon with no opaque pixel", () => {
        expect(backdropFor(icon(pixels(256, 255, 0, 0, 0)))).toBeNull();
    });

    /**
     *  One colour for both themes put near-black discs behind white icons on the light page and
     *  glaring white ones behind dark icons on the dark page - and kept them after a theme change.
     */
    describe("per theme", () => {

        const white = () => backdropFor(icon(pixels(256, 255, 255, 255)));
        const black = () => backdropFor(icon(pixels(256, 0, 0, 0)));

        it("is a light-dark() pair, so the browser switches it with the theme", () => {
            expect(white()).toMatch(PAIR);
        });

        it("keeps the contrast with the icon in both themes", () => {
            expect(disc(white(), "light")[2]).toBeLessThan(50);
            expect(disc(white(), "dark")[2]).toBeLessThan(50);
            expect(disc(black(), "light")[2]).toBeGreaterThan(50);
            expect(disc(black(), "dark")[2]).toBeGreaterThan(50);
        });

        it("leans each disc towards its theme's background", () => {
            // Lighter on the light page, darker on the dark one.
            expect(disc(white(), "light")[2]).toBeGreaterThan(disc(white(), "dark")[2]);
            expect(disc(black(), "light")[2]).toBeGreaterThan(disc(black(), "dark")[2]);
        });

        it("keeps the icon's hue in both", () => {
            const red = backdropFor(icon(pixels(256, 230, 20, 20)));
            expect(disc(red, "dark")[0]).toBe(disc(red, "light")[0]);
            expect(disc(red, "dark")[1]).toBe(disc(red, "light")[1]);
        });
    });
});
