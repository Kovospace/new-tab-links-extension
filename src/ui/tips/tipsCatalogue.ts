import tipsJson from "./tips.json";
import { buildWebsiteUrl } from "../../backend/sync/SyncConfiguration";
import { currentLanguage } from "../../i18n/i18n";
import { FALLBACK_LANGUAGE } from "../../i18n/languages";

/**
 *  The tips shown on the workspace background, and how one is chosen.
 *
 *  **They live in JSON rather than in code** so that adding one is adding an entry, and so
 *  that a translator can be handed a file rather than a TypeScript module. The file is
 *  imported rather than fetched: it is part of the bundle either way, and importing it means
 *  a malformed entry is a build error instead of an empty strip on somebody's new tab page.
 *
 *  A tip is one sentence per language. Nothing here falls back to a language the user did not
 *  ask for except English, which is the language the rest of this extension is written in.
 *
 *  **Which language that is comes from `i18n`, not from the browser.** It used to be read
 *  straight off `chrome.i18n`, which was right while there was nothing else to read it from
 *  and became wrong the moment the settings dialog could answer the question: a reader who
 *  chose English on a Slovak browser would have had the whole interface in English and the
 *  tip at the bottom of it in Slovak.
 */

/** One tip, as the JSON holds it. */
export interface Tip {

    /** Stable name for the tip, so that it can be referred to without its wording. */
    id: string;

    /** The sentence, by language code; "en" is expected to be present for every tip. */
    text: Record<string, string>;

    /**
     *  Where to read more, by language code, for a tip needing more than a sentence.
     *
     *  Per language like the sentence is, because the tutorial it points at is a page on the
     *  website and that page has a language of its own - the Slovak reader of a Slovak tip
     *  should not be dropped onto the English write-up of it.
     *
     *  A path is resolved against the website, so the tutorials can move without every tip
     *  being rewritten; anything with a scheme is taken as it stands. Absent - or an entry
     *  with nothing in it - means the tip explains itself, and no button is offered.
     */
    url?: Record<string, string>;

    /**
     *  What the button says, by language code, when "tell me more" would be the wrong words -
     *  a tip whose link does something (opens Chrome's shortcuts page) rather than explains.
     *  Absent means "tell me more".
     */
    button?: Record<string, string>;
}

/** Every tip there is, in the order the file lists them. */
export const TIPS: ReadonlyArray<Tip> = tipsJson as Tip[];

/**
 *  One tip's sentence, in the given language or in English.
 *
 *  @param tip      the tip to read
 *  @param language the language wanted, as a base code
 *  @return the sentence, or an empty string for a tip with no wording at all
 */
export function textOf(tip: Tip, language: string = currentLanguage()): string {
    return tip.text[language] ?? tip.text[FALLBACK_LANGUAGE] ?? "";
}

/**
 *  What a tip's button says, or null for the usual "tell me more".
 *
 *  @param tip      the tip to read
 *  @param language the language wanted, as a base code
 */
export function buttonLabelOf(tip: Tip, language: string = currentLanguage()): string | null {
    return tip.button?.[language] ?? tip.button?.[FALLBACK_LANGUAGE] ?? null;
}

/**
 *  Where a tip's "tell me more" should lead, or null when it leads nowhere.
 *
 *  Falls back to English the way the sentence does: a tutorial that has not been translated
 *  yet is still worth offering, and the alternative - hiding the button for that reader - is
 *  the less useful of the two.
 *
 *  @param tip      the tip to read
 *  @param language the language wanted, as a base code
 */
export function urlOf(tip: Tip, language: string = currentLanguage()): string | null {

    const url = tip.url?.[language] ?? tip.url?.[FALLBACK_LANGUAGE];
    if (!url) {
        return null;
    }

    return url.includes("://") ? url : buildWebsiteUrl(url);
}

/**
 *  Picks the tip to open with.
 *
 *  Random, because the alternative - starting at the first one - means the last tips in the
 *  file are seen by nobody, and the file is meant to grow.
 *
 *  @param random source of randomness, injectable so a test can be certain of the outcome
 *  @return the index of the tip to show first, or -1 when there are no tips at all
 */
export function randomTipIndex(random: () => number = Math.random): number {
    return TIPS.length === 0 ? -1 : Math.floor(random() * TIPS.length);
}
