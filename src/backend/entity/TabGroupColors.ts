/**
 *  The colours a subgroup can be, which are the colours Chrome will paint a tab group.
 *
 *  **There are nine of them and that is not a choice.** `chrome.tabGroups.update()` takes a
 *  name out of `chrome.tabGroups.Color` and rejects anything else, so a palette of our own -
 *  sixteen swatches, a colour wheel, a hex box - could be shown but never applied: the tab
 *  strip would go on painting something else. The picker therefore offers exactly what the
 *  browser will honour, and the new tab page tints a subgroup with the same colour so that
 *  the page and the tab strip agree.
 *
 *  The swatch values are this file's own approximation of how Chrome draws each colour, used
 *  for the picker and for the subgroup's heading. They do not have to be exact - nothing
 *  compares them with the browser's - but they do have to be recognisable as the colour the
 *  tab group will end up.
 */

/** One of Chrome's tab group colours, by the name the API takes. */
export type TabGroupColor =
    "grey" | "blue" | "red" | "yellow" | "green" | "pink" | "purple" | "cyan" | "orange";

/** A colour, as it is offered and as it is drawn. */
export interface TabGroupColorSwatch {
    color: TabGroupColor;
    /** Roughly what Chrome paints it, for the swatch and the subgroup heading. */
    hex: string;
}

/**
 *  What a colour is called is not here, deliberately: it is a word, and words are translated.
 *  The picker reads it from the catalogue, keyed by `color` - `subgroup.colorDialog.colors.*`.
 */

/**
 *  Every colour, in the order Chrome lists them in its own tab group menu.
 *
 *  The order matters only to the picker; assignment never walks it, so a subgroup is not
 *  quietly biased towards grey by being created first.
 */
export const TAB_GROUP_COLORS: ReadonlyArray<TabGroupColorSwatch> = [
    { color: "grey",   hex: "#5F6368" },
    { color: "blue",   hex: "#1A73E8" },
    { color: "red",    hex: "#D93025" },
    { color: "yellow", hex: "#F9AB00" },
    { color: "green",  hex: "#188038" },
    { color: "pink",   hex: "#D01884" },
    { color: "purple", hex: "#A142F4" },
    { color: "cyan",   hex: "#007B83" },
    { color: "orange", hex: "#FA903E" }
];

/** The colour a tab group gets when a subgroup has never been given one. */
export const DEFAULT_TAB_GROUP_COLOR: TabGroupColor = "blue";

/** Whether a stored value is still one of the colours Chrome accepts. */
export function isTabGroupColor(value: string | undefined | null): value is TabGroupColor {
    return !!value && TAB_GROUP_COLORS.some(swatch => swatch.color === value);
}

/**
 *  How a colour is drawn, or the default's appearance for anything unrecognised.
 *
 *  Unrecognised is a real case, not a defensive one: the account may hold a colour written by
 *  a newer version of this extension, and a snapshot is taken as authoritative.
 */
export function swatchOf(color: string | undefined | null): TabGroupColorSwatch {
    return TAB_GROUP_COLORS.find(swatch => swatch.color === color)
        ?? TAB_GROUP_COLORS.find(swatch => swatch.color === DEFAULT_TAB_GROUP_COLOR)!;
}

/**
 *  Picks the colour a new subgroup should get.
 *
 *  The rule is the one from TODOS.md: a colour nothing is using yet, chosen at random so that
 *  two subgroups made in a row do not march down the palette; and once every colour is in use,
 *  at random among those used least, so the palette stays as evenly spread as it can be.
 *
 *  Counting only what is passed in is deliberate - the caller decides what "in use" means, and
 *  it means the loaded profile. Profiles are separate worlds, and a subgroup in one has no
 *  bearing on the tab groups you see while another is open.
 *
 *  @param inUse   the colours already taken, with repeats; anything unrecognised is ignored
 *  @param random  source of randomness, injectable so a test can be certain of the outcome
 *  @return the colour to use
 */
export function chooseTabGroupColor(
    inUse: ReadonlyArray<string | undefined | null>,
    random: () => number = Math.random
): TabGroupColor {

    const counts = new Map<TabGroupColor, number>(
        TAB_GROUP_COLORS.map(swatch => [swatch.color, 0]));

    for (const color of inUse) {
        if (isTabGroupColor(color)) {
            counts.set(color, (counts.get(color) ?? 0) + 1);
        }
    }

    const fewest = Math.min(...counts.values());
    const candidates = [...counts.entries()]
        .filter(([, count]) => count === fewest)
        .map(([color]) => color);

    return candidates[Math.floor(random() * candidates.length)] ?? DEFAULT_TAB_GROUP_COLOR;
}
