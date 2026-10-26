/**
 *  A backdrop colour for each favicon, chosen from the icon itself (#132).
 *
 *  Every favicon sits on a disc (main.css) so that an icon drawn white - or black - is never the
 *  colour of whatever it is on. One grey for all of them did that job, and looked like it. Here
 *  each icon gets a disc of its own:
 *
 *  - **The icon's dominant hue, calmed.** Saturated pixels vote for a hue, weighted by how
 *    saturated and bright they are; the disc takes the winner at low saturation, so it belongs
 *    to the icon without competing with it, as a dock like DockbarX does. An icon with no colour
 *    of its own - black, white, grey - gets a neutral disc.
 *  - **Contrast measured where the disc meets the icon.** That is the icon's outline - its opaque
 *    pixels next to a transparent one or the edge - not the average of the whole icon: Spotify's
 *    black logo never touches the disc, its green ring does. The disc's lightness is chosen for a
 *    WCAG contrast ratio of at least `MIN_CONTRAST` against that outline. Splitting the icons into
 *    "light" and "dark" by their average put a mid-bright icon - Spotify's green, right at the
 *    split - on a disc of nearly its own brightness.
 *  - **One disc per theme, as quiet as the contrast allows.** Of the lightnesses that reach the
 *    contrast, the one closest to that theme's background is taken; when none does, the one
 *    with the most contrast. Written as a `light-dark()` pair like every colour in
 *    `__variables.css`, so the browser switches it with the theme - open tabs included.
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

/** WCAG's minimum contrast for graphics - icons, controls - against what is next to them. */
const MIN_CONTRAST = 3;

/**
 *  Per theme: the lightness, in percent, a disc would ideally have - near that theme's
 *  background, where it recedes - and the range it may be moved within to reach the contrast.
 */
const LIGHT_THEME = { preferred: 86, darkest: 18, lightest: 92 };
const DARK_THEME = { preferred: 22, darkest: 10, lightest: 80 };

type Theme = typeof LIGHT_THEME;

/**
 *  The disc colour for an icon's pixels.
 *
 *  @param rgba the pixels as a canvas reports them: red, green, blue, alpha, one byte each,
 *              row by row of a square image
 *  @return a CSS colour - a `light-dark()` pair - or null when the icon has no opaque pixel
 */
export function backdropFor(rgba: Uint8ClampedArray | Uint8Array): string | null {
    const side = Math.round(Math.sqrt(rgba.length / 4));
    const opaqueAt = (x: number, y: number) =>
        x >= 0 && y >= 0 && x < side && y < side && rgba[(y * side + x) * 4 + 3] >= MIN_ALPHA;

    let opaque = 0;
    let outline = 0;
    let outlineLuminance = 0;
    let wholeLuminance = 0;
    const votes = new Array<number>(HUE_BINS).fill(0);
    const hueX = new Array<number>(HUE_BINS).fill(0);
    const hueY = new Array<number>(HUE_BINS).fill(0);

    for (let y = 0; y < side; y++) {
        for (let x = 0; x < side; x++) {
            if (!opaqueAt(x, y)) {
                continue;
            }
            const index = (y * side + x) * 4;
            const red = rgba[index] / 255;
            const green = rgba[index + 1] / 255;
            const blue = rgba[index + 2] / 255;
            const luminance = relativeLuminance(red, green, blue);
            opaque++;
            wholeLuminance += luminance;
            // On the outline: a neighbour is transparent, or it is the image's own edge.
            if (!opaqueAt(x - 1, y) || !opaqueAt(x + 1, y) || !opaqueAt(x, y - 1) || !opaqueAt(x, y + 1)) {
                outline++;
                outlineLuminance += luminance;
            }

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
    }

    if (opaque === 0) {
        return null;
    }
    const edge = outline > 0 ? outlineLuminance / outline : wholeLuminance / opaque;

    const winner = votes.indexOf(Math.max(...votes));
    // A hue that only a few stray pixels voted for does not make the icon coloured.
    const coloured = votes[winner] >= opaque * 0.08;
    const hue = coloured
        ? Math.round((Math.atan2(hueY[winner], hueX[winner]) * 180 / Math.PI + 360) % 360)
        : 0;
    const saturation = coloured ? DISC_SATURATION : 0;

    const disc = (theme: Theme) =>
        `hsl(${hue} ${saturation}% ${discLightness(edge, hue, saturation, theme)}%)`;
    return `light-dark(${disc(LIGHT_THEME)}, ${disc(DARK_THEME)})`;
}

/**
 *  The lightness, in percent, for a disc of this hue and saturation against an icon whose
 *  outline has the given luminance: the one nearest the theme's preferred lightness that reaches
 *  `MIN_CONTRAST`, or failing any, the one with the most contrast.
 */
function discLightness(edge: number, hue: number, saturation: number, theme: Theme): number {
    let best = theme.preferred;
    let bestDistance = Infinity;
    let strongest = theme.preferred;
    let strongestRatio = 0;
    for (let lightness = theme.darkest; lightness <= theme.lightest; lightness++) {
        const ratio = contrastRatio(edge, hslLuminance(hue, saturation, lightness));
        if (ratio > strongestRatio) {
            strongestRatio = ratio;
            strongest = lightness;
        }
        const distance = Math.abs(lightness - theme.preferred);
        if (ratio >= MIN_CONTRAST && distance < bestDistance) {
            bestDistance = distance;
            best = lightness;
        }
    }
    return bestDistance === Infinity ? strongest : best;
}

/** WCAG's contrast ratio between two relative luminances, 1 to 21. */
export function contrastRatio(first: number, second: number): number {
    const lighter = Math.max(first, second);
    const darker = Math.min(first, second);
    return (lighter + 0.05) / (darker + 0.05);
}

/** The relative luminance of an `hsl(hue saturation% lightness%)` colour. */
export function hslLuminance(hue: number, saturation: number, lightness: number): number {
    const s = saturation / 100;
    const l = lightness / 100;
    const chroma = (1 - Math.abs(2 * l - 1)) * s;
    const channel = (n: number) => {
        const k = (n + hue / 30) % 12;
        return l - chroma / 2 * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    };
    return relativeLuminance(channel(0), channel(8), channel(4));
}

/** WCAG's relative luminance of an sRGB colour, each channel 0..1. */
export function relativeLuminance(red: number, green: number, blue: number): number {
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
