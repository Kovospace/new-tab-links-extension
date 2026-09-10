import tipsJson from "./tips.json";
import { buildWebsiteUrl } from "../../backend/sync/SyncConfiguration";

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
 */

/** One tip, as the JSON holds it. */
export interface Tip {

    /** Stable name for the tip, so that it can be referred to without its wording. */
    id: string;

    /** The sentence, by language code; "en" is expected to be present for every tip. */
    text: Record<string, string>;

    /**
     *  Where to read more, for a tip about something that needs more than a sentence.
     *
     *  A path is resolved against the website, so the tutorials can move without every tip
     *  being rewritten; anything with a scheme is taken as it stands. Absent means the tip
     *  explains itself, and no button is offered.
     */
    url?: string;
}

/** Every tip there is, in the order the file lists them. */
export const TIPS: ReadonlyArray<Tip> = tipsJson as Tip[];

/** The language the rest of this extension is written in, and the fallback for every tip. */
const FALLBACK_LANGUAGE = "en";

/**
 *  The language to show tips in: the browser's, reduced to its base.
 *
 *  "sk-SK" and "sk" are the same language as far as a tip is concerned, and a file that had
 *  to list every regional variant would be a file nobody keeps up to date.
 */
export function currentLanguage(): string {
    const uiLanguage = chrome.i18n?.getUILanguage?.() ?? FALLBACK_LANGUAGE;
    return uiLanguage.split("-")[0].toLowerCase();
}

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
 *  Where a tip's "tell me more" should lead, or null when it leads nowhere.
 *
 *  @param tip the tip to read
 */
export function urlOf(tip: Tip): string | null {
    if (!tip.url) {
        return null;
    }
    return tip.url.includes("://") ? tip.url : buildWebsiteUrl(tip.url);
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
