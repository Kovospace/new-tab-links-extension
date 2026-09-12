import { CATALOGUES } from "./catalogue";
import {
    baseLanguageOf, browserLanguageTag, FALLBACK_LANGUAGE, isSupportedLanguage, resolveLanguage
} from "./languages";

/**
 *  Every sentence this extension says, and the one function that says it.
 *
 *  **The wording is JSON, not code** (`locales/<language>/<area>.json`), for the reason the
 *  tips already are: adding a language is adding a folder, and a translator can be handed
 *  files rather than a TypeScript module. The files are imported rather than fetched, so a
 *  malformed one is a build error instead of an empty page in somebody's browser - and so
 *  that `t()` can answer synchronously, which every component here needs it to: rendering is
 *  not asynchronous, and a translator that had to be awaited would mean either a page drawn
 *  in keys and corrected afterwards, or every render turning into a promise.
 *
 *  **Nothing here is loaded per language at runtime.** Both catalogues are in the bundle. Two
 *  languages of a few hundred short strings is tens of kilobytes, and the alternative - a
 *  fetch before the first paint - costs the new tab page a frame on every open, for ever, to
 *  save that.
 *
 *  A key is `<file>.<path inside it>`: `t("group.menu.delete")` is `delete` under `menu` in
 *  `group.json`. A key with no wording in the chosen language falls back to English, and one
 *  with no wording at all is returned as itself - visible, searchable, and not a crash.
 */

/** What the JSON holds: strings, plural forms, and objects of either. */
export type CatalogueNode = string | PluralForms | { [key: string]: CatalogueNode };

/**
 *  A sentence that changes with a number.
 *
 *  The categories are `Intl.PluralRules`', which is why this is not "singular and plural":
 *  English has two forms, Slovak has four, and a scheme with two would make every Slovak
 *  count read wrong for three of them.
 */
export interface PluralForms {
    zero?: string;
    one?: string;
    two?: string;
    few?: string;
    many?: string;
    /** The form used when no more specific one fits; every plural entry needs it. */
    other: string;
}

/** Values substituted into `{placeholders}`; `count` also chooses the plural form. */
export type Params = Record<string, string | number>;

/** The language being spoken right now. Set once at startup, before anything is drawn. */
let language: string = FALLBACK_LANGUAGE;

/** The browser's own tag, kept so dates can be formatted the way this region writes them. */
let localeTag: string = FALLBACK_LANGUAGE;

/**
 *  Chooses the language for this page.
 *
 *  Called once from each entry point, immediately after the device preferences are read and
 *  before anything renders - a page drawn in one language and corrected into another is a
 *  page that flickers, and one of the two renders was wasted.
 *
 *  @param stored what the device preference holds: a base code, or "auto", or nothing
 *  @return the language actually chosen, which is always one there is a catalogue for
 */
export function setLanguage(stored?: string | null): string {
    language = resolveLanguage(stored);
    localeTag = localeTagFor(language);
    return language;
}

/** The language being spoken, as a base code. */
export function currentLanguage(): string {
    return language;
}

/**
 *  The tag to hand `Intl`, which is not the same thing as the language.
 *
 *  The language decides the words; the region decides the order the parts of a date go in and
 *  whether a clock has twelve hours or twenty-four. A reader whose browser is "en-GB" and
 *  whose chosen language is English should see a British date, not an American one - so the
 *  browser's full tag is kept when its base is the language we are speaking, and only its
 *  base is used when the user has deliberately chosen something else.
 */
function localeTagFor(base: string): string {
    const browserTag = browserLanguageTag();
    return baseLanguageOf(browserTag) === base ? browserTag : base;
}

/** The tag to hand `Intl` for dates, times and numbers. */
export function currentLocaleTag(): string {
    return localeTag;
}

/**
 *  Puts the chosen language on the document, for the browser rather than for us.
 *
 *  `lang` is what hyphenation, spell-checking and a screen reader's pronunciation are chosen
 *  from; a Slovak page announcing itself as English is read aloud in an English accent.
 */
export function applyLanguageToDocument(doc: Document = document): void {
    doc.documentElement.lang = language;
}

/**
 *  One sentence, in the language being spoken.
 *
 *  @param key    `<file>.<path>`, e.g. "group.menu.delete"
 *  @param params values for `{placeholders}`; `count` also picks the plural form
 *  @return the wording, or the key itself when there is none anywhere
 */
export function t(key: string, params?: Params): string {

    const found = lookup(language, key) ?? lookup(FALLBACK_LANGUAGE, key);
    if (found === null) {
        // Returned rather than thrown: a missing sentence should cost the user one ugly label,
        // not the screen it was on. It is visible, and it is greppable, which is how it gets
        // fixed.
        return key;
    }

    return interpolate(chooseForm(found, params), params);
}

/**
 *  Whether there is wording for a key at all.
 *
 *  For the few places that have something else to draw when there is not - a tip with no
 *  tutorial, an error the backend worded itself.
 */
export function hasTranslation(key: string): boolean {
    return lookup(language, key) !== null || lookup(FALLBACK_LANGUAGE, key) !== null;
}

/** Walks the dotted key into one language's catalogue. */
function lookup(inLanguage: string, key: string): string | PluralForms | null {

    let node: CatalogueNode | undefined = CATALOGUES[inLanguage];

    for (const segment of key.split(".")) {
        if (typeof node !== "object" || node === null) {
            return null;
        }
        node = (node as { [key: string]: CatalogueNode })[segment];
    }

    if (typeof node === "string") {
        return node;
    }
    // A plural entry is an object, and so is a branch of the tree; what tells them apart is
    // that a plural entry is required to carry "other".
    if (node && typeof node === "object" && typeof (node as PluralForms).other === "string") {
        return node as PluralForms;
    }
    return null;
}

/**
 *  Picks the form of a plural entry that goes with the count.
 *
 *  Through `Intl.PluralRules` rather than `count === 1`, because that comparison is an English
 *  rule wearing the clothes of a universal one: Slovak wants a different word for two, three
 *  and four than for five, and getting it wrong is the kind of mistake a reader notices
 *  immediately and cannot report precisely.
 */
function chooseForm(entry: string | PluralForms, params?: Params): string {

    if (typeof entry === "string") {
        return entry;
    }

    const count = params?.count;
    if (typeof count !== "number") {
        return entry.other;
    }

    const category = new Intl.PluralRules(localeTag).select(count);
    return entry[category as keyof PluralForms] ?? entry.other;
}

/** Replaces `{name}` with what was passed for it; anything unpassed is left as it stands. */
function interpolate(text: string, params?: Params): string {
    if (!params) {
        return text;
    }
    return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
        name in params ? String(params[name]) : whole);
}

/** Whether a language code is one this extension actually has a catalogue for. */
export { isSupportedLanguage };
