import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { ACCENT_COLORS, DEFAULT_ACCENT_COLOR } from "../../../src/backend/repository/DevicePreferencesRepository";
import { ACCENT_SWATCHES } from "../../../src/viewModel/settingsViewModel";

/**
 *  #200: the accent colours a browser can choose. Each has to stay legible under its own text,
 *  in both themes, and none may look like the colours that already mean something - red
 *  (delete), green (add), grey (inactive). jsdom computes no colours, so the stylesheet's
 *  values are read and measured here.
 */
const CSS = readFileSync(resolve("src/ui/styles/__variables.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** The declarations of one block, by its selector. */
function block(selector: string): string {
    const found = [...CSS.matchAll(/([^{}]+)\{([^}]*)\}/g)].find(match => match[1].trim() === selector);
    if (!found) throw new Error(`no block ${selector}`);
    return found[2];
}

/** A variable's light and dark values, falling back to the default accent's for one not set. */
function pair(accent: string, variable: string): [string, string] {
    const own = accent === DEFAULT_ACCENT_COLOR ? null : block(`:root[data-accent="${accent}"]`);
    const pattern = new RegExp(`${variable}:\\s*light-dark\\((#[0-9a-fA-F]{3,6}),\\s*(#[0-9a-fA-F]{3,6})\\)`);
    const match = (own && own.match(pattern)) ?? block(":root").match(pattern);
    if (!match) throw new Error(`${variable} not found for ${accent}`);
    return [match[1], match[2]];
}

function rgb(hex: string): [number, number, number] {
    const digits = hex.slice(1);
    const full = digits.length === 3 ? [...digits].map(digit => digit + digit).join("") : digits;
    return [0, 2, 4].map(at => parseInt(full.slice(at, at + 2), 16) / 255) as [number, number, number];
}

function luminance(hex: string): number {
    const [r, g, b] = rgb(hex).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(one: string, other: string): number {
    const [light, dark] = [luminance(one), luminance(other)].sort((a, b) => b - a);
    return (light + 0.05) / (dark + 0.05);
}

function hueAndSaturation(hex: string): { hue: number; saturation: number } {
    const [r, g, b] = rgb(hex);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), chroma = max - min;
    const hue = chroma === 0 ? 0
        : max === r ? 60 * (((g - b) / chroma) % 6)
        : max === g ? 60 * ((b - r) / chroma + 2)
        : 60 * ((r - g) / chroma + 4);
    return { hue: (hue + 360) % 360, saturation: max === 0 ? 0 : chroma / max };
}

describe("the accent colours", () => {

    it("offers between five and ten, amber - the identity colour - first and by default (#211)", () => {
        expect(ACCENT_COLORS.length).toBeGreaterThanOrEqual(5);
        expect(ACCENT_COLORS.length).toBeLessThanOrEqual(10);
        expect(ACCENT_COLORS[0]).toBe("amber");
        expect(DEFAULT_ACCENT_COLOR).toBe("amber");
    });

    it.each(ACCENT_COLORS)("keeps %s's text legible in both themes, at rest and under the pointer", accent => {
        for (const theme of [0, 1]) {
            const background = pair(accent, "--color-theme-accent-background")[theme];
            const hover = pair(accent, "--color-theme-accent-background-hover")[theme];
            const text = pair(accent, "--color-theme-accent-text")[theme];
            const textHover = pair(accent, "--color-theme-accent-text-hover")[theme];
            expect(contrast(background, text)).toBeGreaterThanOrEqual(4.5);
            expect(contrast(hover, textHover)).toBeGreaterThanOrEqual(3);
        }
    });

    it.each(ACCENT_COLORS)("keeps %s clear of red, green and grey", accent => {
        const { hue, saturation } = hueAndSaturation(pair(accent, "--color-theme-accent-background")[0]);
        expect(saturation).toBeGreaterThan(0.5);
        expect(Math.min(hue, 360 - hue)).toBeGreaterThan(20);   // red
        expect(Math.abs(hue - 120)).toBeGreaterThan(45);         // green
    });

    it.each(ACCENT_COLORS)("draws %s's swatch in its own colour", accent => {
        expect(ACCENT_SWATCHES[accent]?.toLowerCase())
            .toBe(pair(accent, "--color-theme-accent-background")[0].toLowerCase());
    });
});
