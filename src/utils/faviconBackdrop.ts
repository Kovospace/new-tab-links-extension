/**
 *  A backdrop colour for each favicon, chosen from the icon itself (#132).
 *
 *  Every favicon sits on a disc (main.css) so that an icon drawn white - or black - is never the
 *  colour of whatever it is on. One grey for all of them did that job, and looked like it. Here
 *  each icon gets a disc of its own, on two rules a dock like DockbarX uses:
 *
 *  - **The icon's dominant hue, calmed.** Saturated pixels vote for a hue, weighted by how
 *    saturated and bright they are; the disc takes the winner at low saturation, so it belongs
 *    to the icon without competing with it. An icon with no colour of its own - black, white,
 *    grey - gets a neutral disc.
 *  - **Lightness opposite to the icon's.** A light icon gets a dark disc and a dark one a light
 *    disc, which is the contrast the disc is there for.
 *
 *  The pixels are read through a canvas, which the browser allows only for an image it considers
 *  this page's own - a data URL, an extension path. A favicon from another site may be refused;
 *  it then keeps the default disc (`--color-favicon-backdrop`), as does an icon not yet loaded.
 */

/** Hue bins the saturated pixels vote into; 12 is 30° each, enough to tell red from orange. */
const HUE_BINS = 12;

/** A pixel this see-through is part of the icon's shape around it, not the icon. */
const MIN_ALPHA = 128;

/** Below this saturation a pixel is black, white or grey, and votes for no hue. */
const MIN_SATURATION = 0.25;

/** The disc's saturation when the icon has a hue: enough to be that colour, calm enough to recede. */
const DISC_SATURATION = 22;

/** The disc's lightness behind a light icon, and behind a dark one, in percent. */
const DARK_DISC = 24;
const LIGHT_DISC = 86;

/** An icon this bright on average (relative luminance, 0..1) gets the dark disc. */
const LIGHT_ICON = 0.5;

/**
 *  The disc colour for an icon's pixels.
 *
 *  @param rgba the pixels as a canvas reports them: red, green, blue, alpha, one byte each
 *  @return a CSS colour, or null when the icon has no opaque pixel to judge it by
 */
export function backdropFor(rgba: Uint8ClampedArray | Uint8Array): string | null {
    let opaque = 0;
    let luminance = 0;
    const votes = new Array<number>(HUE_BINS).fill(0);
    const hueX = new Array<number>(HUE_BINS).fill(0);
    const hueY = new Array<number>(HUE_BINS).fill(0);

    for (let index = 0; index + 3 < rgba.length; index += 4) {
        if (rgba[index + 3] < MIN_ALPHA) {
            continue;
        }
        const red = rgba[index] / 255;
        const green = rgba[index + 1] / 255;
        const blue = rgba[index + 2] / 255;
        opaque++;
        luminance += relativeLuminance(red, green, blue);

        const max = Math.max(red, green, blue);
        const min = Math.min(red, green, blue);
        const saturation = max === 0 ? 0 : (max - min) / max;
        if (saturation < MIN_SATURATION) {
            continue;
        }
        const hue = hueOf(red, green, blue, max, min);
        const bin = Math.floor(hue / (360 / HUE_BINS)) % HUE_BINS;
        const weight = saturation * max;
        votes[bin] += weight;
        // Averaged as a direction, so 355° and 5° make red rather than cyan.
        hueX[bin] += Math.cos(hue * Math.PI / 180) * weight;
        hueY[bin] += Math.sin(hue * Math.PI / 180) * weight;
    }

    if (opaque === 0) {
        return null;
    }
    const lightness = luminance / opaque >= LIGHT_ICON ? DARK_DISC : LIGHT_DISC;

    const winner = votes.indexOf(Math.max(...votes));
    // A hue that only a few stray pixels voted for does not make the icon coloured.
    if (votes[winner] < opaque * 0.08) {
        return `hsl(0 0% ${lightness}%)`;
    }
    const hue = Math.round((Math.atan2(hueY[winner], hueX[winner]) * 180 / Math.PI + 360) % 360);
    return `hsl(${hue} ${DISC_SATURATION}% ${lightness}%)`;
}

function relativeLuminance(red: number, green: number, blue: number): number {
    const linear = (channel: number) =>
        channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
    return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
}

function hueOf(red: number, green: number, blue: number, max: number, min: number): number {
    const delta = max - min;
    let hue: number;
    if (max === red) {
        hue = ((green - blue) / delta) % 6;
    } else if (max === green) {
        hue = (blue - red) / delta + 2;
    } else {
        hue = (red - green) / delta + 4;
    }
    return (hue * 60 + 360) % 360;
}

/** Discs already worked out, by image address: the same favicon appears in many places. */
const known = new Map<string, string | null>();

/** The icon drawn while the real one is on its way; it keeps the default disc. */
const PLACEHOLDER = "favicon-default";

/** Side of the canvas the icon is read at - plenty to judge a hue by, and cheap. */
const SAMPLE_SIDE = 16;

/**
 *  Gives a favicon `<img>` a disc of its own colour, now if it has loaded and again whenever it
 *  loads another picture - the worker's icon replacing the placeholder, "refresh icon".
 */
export function followFaviconBackdrop(img: HTMLImageElement): void {
    const apply = () => applyBackdrop(img);
    img.addEventListener("load", apply);
    if (img.complete && img.naturalWidth > 0) {
        apply();
    }
}

function applyBackdrop(img: HTMLImageElement): void {
    const source = img.currentSrc || img.src;
    if (!source || source.includes(PLACEHOLDER)) {
        img.style.removeProperty("--favicon-backdrop");
        return;
    }
    if (!known.has(source)) {
        known.set(source, readBackdrop(img));
    }
    const colour = known.get(source);
    if (colour) {
        img.style.setProperty("--favicon-backdrop", colour);
    } else {
        img.style.removeProperty("--favicon-backdrop");
    }
}

/** Reads the icon's pixels; null when the browser will not hand them over. */
function readBackdrop(img: HTMLImageElement): string | null {
    try {
        const canvas = document.createElement("canvas");
        canvas.width = SAMPLE_SIDE;
        canvas.height = SAMPLE_SIDE;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) {
            return null;
        }
        context.drawImage(img, 0, 0, SAMPLE_SIDE, SAMPLE_SIDE);
        return backdropFor(context.getImageData(0, 0, SAMPLE_SIDE, SAMPLE_SIDE).data);
    } catch {
        // An image from another site taints the canvas; reading it throws. The default disc stays.
        return null;
    }
}
