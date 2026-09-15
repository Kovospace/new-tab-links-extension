import { describe, expect, it } from "vitest";

import { CATALOGUES } from "../../src/i18n/catalogue";
import { FALLBACK_LANGUAGE, SUPPORTED_LANGUAGES } from "../../src/i18n/languages";

/**
 *  What every language has to have, and what none of them may have on its own.
 *
 *  A missing key does not break anything at runtime - `t()` falls back to English - which is
 *  exactly why it needs a test: a sentence quietly shown in the wrong language is invisible to
 *  everyone who reads English, which includes everyone who would notice it. This is the file
 *  that names the gap, and it names it precisely rather than saying "a locale is incomplete".
 *
 *  The other direction is worth checking too. A key in Slovak that is in no English file is
 *  either a typo or the leftover of something renamed, and both read the same from here: a
 *  translated sentence nothing will ever show.
 */

/** Every key a catalogue holds, as dotted paths, with plural entries counted as one key. */
function keysOf(node: unknown, prefix = ""): string[] {

    if (typeof node === "string") {
        return [prefix];
    }
    if (!node || typeof node !== "object") {
        return [];
    }
    // A plural entry is an object with "other" in it, and it is one key however many forms it
    // carries: English has two of them and Slovak four, and neither is missing anything.
    if (typeof (node as Record<string, unknown>).other === "string") {
        return [prefix];
    }

    return Object.entries(node as Record<string, unknown>)
        .flatMap(([key, value]) => keysOf(value, prefix ? `${prefix}.${key}` : key));
}

const referenceKeys = keysOf(CATALOGUES[FALLBACK_LANGUAGE]).sort();

describe("the catalogues", () => {

    it("has one for every language the settings dialog offers", () => {
        for (const language of SUPPORTED_LANGUAGES) {
            expect(CATALOGUES[language.code], language.code).toBeDefined();
        }
    });

    it("says something in every language", () => {
        expect(referenceKeys.length).toBeGreaterThan(0);
    });

    for (const language of SUPPORTED_LANGUAGES) {

        if (language.code === FALLBACK_LANGUAGE) {
            continue;
        }

        it(`translates every key into ${language.code}`, () => {
            const translated = new Set(keysOf(CATALOGUES[language.code]));
            const missing = referenceKeys.filter(key => !translated.has(key));
            expect(missing).toEqual([]);
        });

        it(`has nothing in ${language.code} that ${FALLBACK_LANGUAGE} does not have`, () => {
            const reference = new Set(referenceKeys);
            const orphaned = keysOf(CATALOGUES[language.code])
                .filter(key => !reference.has(key));
            expect(orphaned).toEqual([]);
        });
    }

    /**
     *  A placeholder is part of the sentence's contract with the code that shows it. A
     *  translation that drops `{name}` renders a sentence with a hole in it, and one that
     *  invents `{nazov}` renders the brace and the word, in front of the user.
     */
    for (const language of SUPPORTED_LANGUAGES) {

        if (language.code === FALLBACK_LANGUAGE) {
            continue;
        }

        it(`uses the same placeholders in ${language.code}`, () => {
            const wrong: string[] = [];

            for (const key of referenceKeys) {
                const expected = placeholdersOf(read(FALLBACK_LANGUAGE, key));
                const actual = placeholdersOf(read(language.code, key));
                if (expected.join() !== actual.join()) {
                    wrong.push(`${key}: expected ${expected.join()}, found ${actual.join()}`);
                }
            }

            expect(wrong).toEqual([]);
        });
    }
});

/** Every form of one entry, run together - a plural entry has to be checked in full. */
function read(language: string, key: string): string {
    let node: unknown = CATALOGUES[language];
    for (const segment of key.split(".")) {
        node = (node as Record<string, unknown>)?.[segment];
    }
    if (typeof node === "string") {
        return node;
    }
    return Object.values(node as Record<string, string>).join(" ");
}

/** The `{placeholders}` a sentence uses, deduplicated and in a stable order. */
function placeholdersOf(text: string): string[] {
    return [...new Set(text.match(/\{(\w+)\}/g) ?? [])].sort();
}
