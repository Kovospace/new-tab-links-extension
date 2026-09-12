import { beforeEach, describe, expect, it, vi } from "vitest";

import { currentLanguage, currentLocaleTag, setLanguage, t } from "../../src/i18n/i18n";
import {
    AUTOMATIC_LANGUAGE, baseLanguageOf, isSupportedLanguage, resolveLanguage
} from "../../src/i18n/languages";

/**
 *  The translator, and the rules that decide which language it speaks.
 *
 *  Every test here names a way of getting this wrong that costs the user something real: a
 *  page of keys, a sentence with a hole in it, or - the one that is hardest to notice from
 *  England - a count worded with an English plural rule and read by somebody whose language
 *  has four of them.
 */

/** Pretends the browser is set to a language, the way `chrome.i18n` would report it. */
function browserSetTo(tag: string): void {
    (globalThis as { chrome?: unknown }).chrome = {
        i18n: { getUILanguage: () => tag }
    };
}

beforeEach(() => {
    browserSetTo("en-GB");
    setLanguage(AUTOMATIC_LANGUAGE);
});

describe("choosing a language", () => {

    it("follows the browser when the device has not been asked", () => {
        browserSetTo("sk-SK");
        expect(setLanguage(AUTOMATIC_LANGUAGE)).toBe("sk");
    });

    /**
     *  The rule TODOS.md asks for, and the one that decides what a German reader sees. English
     *  rather than keys, and rather than a half-page of one language and half of another.
     */
    it("falls back to English for a language it does not have", () => {
        browserSetTo("de-DE");
        expect(setLanguage(AUTOMATIC_LANGUAGE)).toBe("en");
    });

    it("obeys a language the user chose, whatever the browser says", () => {
        browserSetTo("en-GB");
        expect(setLanguage("sk")).toBe("sk");
        expect(currentLanguage()).toBe("sk");
    });

    /**
     *  Storage can hold a language this build does not ship - written by a newer version, or
     *  edited by hand. Reading it as itself would be a page of keys with the control for
     *  fixing that on the same page.
     */
    it("treats a stored language it no longer ships as following the browser", () => {
        browserSetTo("sk-SK");
        expect(setLanguage("de")).toBe("sk");
    });

    it("reduces a regional tag to its base", () => {
        expect(baseLanguageOf("sk-SK")).toBe("sk");
        expect(baseLanguageOf("EN-us")).toBe("en");
        expect(baseLanguageOf(null)).toBe("en");
    });

    it("knows which languages it has", () => {
        expect(isSupportedLanguage("sk")).toBe(true);
        expect(isSupportedLanguage("de")).toBe(false);
    });

    it("resolves nothing at all to the browser's language", () => {
        browserSetTo("sk");
        expect(resolveLanguage(undefined)).toBe("sk");
    });
});

/**
 *  The language decides the words; the region decides the order the parts of a date go in.
 *  Keeping the browser's full tag is what lets an English reader in Britain see a British date
 *  rather than an American one - and dropping the region when the user has chosen another
 *  language is what stops a Slovak reader in Britain getting British month names.
 */
describe("the locale handed to Intl", () => {

    it("keeps the browser's region while the language matches it", () => {
        browserSetTo("en-GB");
        setLanguage(AUTOMATIC_LANGUAGE);
        expect(currentLocaleTag()).toBe("en-GB");
    });

    it("drops the region when the user chose another language", () => {
        browserSetTo("en-GB");
        setLanguage("sk");
        expect(currentLocaleTag()).toBe("sk");
    });
});

describe("t", () => {

    it("returns the wording for a key", () => {
        expect(t("common.cancel")).toBe("Cancel");
    });

    it("answers in the chosen language", () => {
        setLanguage("sk");
        expect(t("common.cancel")).toBe("Zrušiť");
    });

    it("fills placeholders in", () => {
        expect(t("profiles.manager.rename", { name: "Work" })).toBe("Rename Work");
    });

    it("leaves a placeholder nobody passed alone rather than printing undefined", () => {
        expect(t("profiles.manager.rename")).toBe("Rename {name}");
    });

    /**
     *  A missing sentence should cost one ugly label, not the screen it was on - and the label
     *  has to be the key, because that is the only thing anybody can search for afterwards.
     */
    it("returns the key itself when there is no wording at all", () => {
        expect(t("group.menu.thereIsNoSuchThing")).toBe("group.menu.thereIsNoSuchThing");
    });

    it("falls back to English for a key one language is missing", () => {
        setLanguage("sk");
        // Proven by construction elsewhere: catalogue.test.ts asserts there is no such key
        // today, so this asserts the mechanism rather than a gap.
        expect(t("common.ok")).toBe("OK");
    });
});

describe("plurals", () => {

    it("does not say 1 hours", () => {
        expect(t("dates.age.hours", { count: 1 })).toBe("an hour ago");
        expect(t("dates.age.hours", { count: 2 })).toBe("2 hours ago");
    });

    /**
     *  The reason plurals go through `Intl.PluralRules` rather than through `count === 1`.
     *  Slovak wants one word for two, three and four and another for five, and a scheme with
     *  two forms gets three cases in every ten wrong.
     */
    it("uses the chosen language's own plural rules", () => {
        setLanguage("sk");
        expect(t("profiles.contents.links", { count: 1 })).toBe("1 odkaz");
        expect(t("profiles.contents.links", { count: 3 })).toBe("3 odkazy");
        expect(t("profiles.contents.links", { count: 7 })).toBe("7 odkazov");
    });

    it("uses the general form when no count is passed", () => {
        expect(t("dates.age.days")).toBe("{count} days ago");
    });
});
