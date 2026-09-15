/**
 *  Which languages this extension is written in, and how one is chosen for a browser.
 *
 *  A language is identified by its **base code** - "sk", never "sk-SK". A catalogue that had
 *  to list every regional variant would be a catalogue nobody keeps up to date, and the
 *  difference between Slovak in Slovakia and Slovak elsewhere is not a difference in any
 *  sentence this extension says. Where the region does matter - the order the parts of a date
 *  go in - it is read from the browser's own tag rather than from here; see `dates.ts`.
 */

/** One language on offer, as the settings dialog lists it. */
export interface Language {

    /** Base code, which is also the name of its folder under `locales/`. */
    code: string;

    /** What speakers of it call it - a list of languages is read by people who read none. */
    nativeName: string;
}

/**
 *  The language everything falls back to.
 *
 *  It is the language the extension is written in first: a key with no Slovak yet is shown in
 *  English rather than as its own name, because an untranslated sentence still says something
 *  and a key says nothing.
 */
export const FALLBACK_LANGUAGE = "en";

/**
 *  What "follow the browser" is stored as.
 *
 *  A value of its own rather than storing the guessed language, because the two mean different
 *  things: a device set to "auto" follows a browser whose language may change afterwards, and
 *  a device set to "en" stays English whatever the browser does later.
 */
export const AUTOMATIC_LANGUAGE = "auto";

/** Every language there is, in the order the settings dialog offers them. */
export const SUPPORTED_LANGUAGES: ReadonlyArray<Language> = [
    { code: "en", nativeName: "English" },
    { code: "sk", nativeName: "Slovenčina" }
];

/** "sk-SK" → "sk"; anything unreadable → the fallback. */
export function baseLanguageOf(tag: string | null | undefined): string {
    if (!tag) {
        return FALLBACK_LANGUAGE;
    }
    return tag.split("-")[0].trim().toLowerCase() || FALLBACK_LANGUAGE;
}

/** Whether there is a catalogue for this base code. */
export function isSupportedLanguage(code: string): boolean {
    return SUPPORTED_LANGUAGES.some(language => language.code === code);
}

/**
 *  The full language tag this browser is set to, region and all.
 *
 *  `chrome.i18n` is the browser's own answer and the one to prefer; `navigator.language` is
 *  what a test environment and a plain page have. Neither is guaranteed, hence the fallback.
 */
export function browserLanguageTag(): string {
    const fromChrome = typeof chrome !== "undefined"
        ? chrome.i18n?.getUILanguage?.()
        : undefined;
    return fromChrome
        || (typeof navigator !== "undefined" ? navigator.language : "")
        || FALLBACK_LANGUAGE;
}

/**
 *  The language to speak on this browser, from what the device is set to.
 *
 *  This is the rule TODOS.md asks for: guess from the system, use it when it is a language we
 *  have, and fall back to English when it is not - a German browser is answered in English
 *  rather than in keys.
 *
 *  @param stored what the device preference holds: a base code, or "auto", or nothing at all
 *  @return a base code there is certainly a catalogue for
 */
export function resolveLanguage(stored?: string | null): string {

    if (stored && stored !== AUTOMATIC_LANGUAGE) {
        const chosen = baseLanguageOf(stored);
        if (isSupportedLanguage(chosen)) {
            return chosen;
        }
        // A stored language we no longer ship - a locale removed, or storage written by a
        // newer version - is not a reason to show keys.
    }

    const guessed = baseLanguageOf(browserLanguageTag());
    return isSupportedLanguage(guessed) ? guessed : FALLBACK_LANGUAGE;
}
