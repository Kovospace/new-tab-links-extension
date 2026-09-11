import { beforeEach, describe, expect, it } from "vitest";

import { ProfileRepository } from "../../src/backend/repository/ProfileRepository";
import { TipsViewModel } from "../../src/viewModel/tipsViewModel";
import { TIPS, textOf, urlOf } from "../../src/ui/tips/tipsCatalogue";

/** Always picks the first tip, so a test can say which tip it is talking about. */
const first = () => 0;

describe("TipsViewModel", () => {

    let profiles: ProfileRepository;
    let tips: TipsViewModel;

    beforeEach(async () => {
        profiles = new ProfileRepository();
        await profiles.init();
        tips = new TipsViewModel(profiles, first);
        tips.initialize();
    });

    const shown = () => tips.observables.tips.get();

    it("shows a tip on a profile that has not dismissed them", () => {
        expect(shown().visible).toBe(true);
        expect(shown().tip?.text).toBe(textOf(TIPS[0]));
    });

    it("steps forward and wraps round the end", () => {
        for (let i = 0; i < TIPS.length; i++) {
            tips.next();
        }

        // A full lap is back where it started; there is no end to walk off.
        expect(shown().tip?.id).toBe(TIPS[0].id);
    });

    it("steps backwards from the first tip to the last", () => {
        tips.previous();

        expect(shown().tip?.id).toBe(TIPS[TIPS.length - 1].id);
    });

    it("offers somewhere to read more only for a tip that has somewhere", () => {
        // The button is drawn from this, so a tip without a url must report null rather than
        // an address built out of nothing.
        for (let i = 0; i < TIPS.length; i++) {
            expect(shown().tip?.url).toBe(urlOf(TIPS[i]));
            tips.next();
        }
    });

    it("stops showing tips once they are dismissed", async () => {
        await tips.hide();

        expect(shown().visible).toBe(false);
        expect(shown().tip).toBeNull();
        expect(profiles.getSettings().hideTips).toBe(true);
    });

    it("shows them again when the setting is turned back off", async () => {
        // Settings is the way back, and it writes to the same registry this watches - so the
        // tips have to return without the page being reloaded.
        await tips.hide();

        await profiles.updateSettings({ hideTips: false });

        expect(shown().visible).toBe(true);
    });

    it("says nothing on a profile that arrived with tips dismissed", async () => {
        // Which is what a profile pulled from an account that dismissed them looks like.
        await profiles.updateSettings({ hideTips: true });

        const other = new TipsViewModel(profiles, first);
        other.initialize();

        expect(other.observables.tips.get().visible).toBe(false);
    });
});

describe("the tips file", () => {

    it("has an English sentence for every tip", () => {
        // English is what everything else falls back to; a tip without it would show as an
        // empty bar to anyone whose language it does not name.
        for (const tip of TIPS) {
            expect(tip.text.en, `tip "${tip.id}" has no English`).toBeTruthy();
        }
    });

    it("gives every tip a distinct name", () => {
        const ids = TIPS.map(tip => tip.id);

        expect(new Set(ids).size).toBe(ids.length);
    });

    it("falls back to English for a language it does not have", () => {
        expect(textOf(TIPS[0], "de")).toBe(TIPS[0].text.en);
    });

    it("prefers the reader's language when the tip has it", () => {
        const translated = TIPS.find(tip => tip.text.sk);

        expect(translated && textOf(translated, "sk")).toBe(translated?.text.sk);
    });

    it("names every language of a tip's link in that tip's own text", () => {
        // A link in a language the tip is not written in would send a reader to a page they
        // cannot read while the sentence above it is in their own language.
        for (const tip of TIPS) {
            for (const language of Object.keys(tip.url ?? {})) {
                expect(tip.text[language], `tip "${tip.id}" links in ${language} but does not speak it`)
                    .toBeTruthy();
            }
        }
    });
});

/**
 *  A tip's link is per language, like its sentence: the tutorial it points at is a page on the
 *  website, and that page has a language of its own.
 */
describe("a tip's link", () => {

    const linked = TIPS.find(tip => tip.url?.sk)!;
    const englishOnly = TIPS.find(tip => tip.url?.en && !tip.url?.sk)!;

    it("takes the reader's own language when the tip has one", () => {
        expect(urlOf(linked, "sk")).toContain(linked.url!.sk);
        expect(urlOf(linked, "en")).toContain(linked.url!.en);
    });

    it("falls back to English rather than offering nothing", () => {
        // An untranslated tutorial is still worth reading; hiding the button would be the
        // less useful of the two.
        expect(urlOf(englishOnly, "sk")).toContain(englishOnly.url!.en);
    });

    it("resolves a path against the website, so the tutorials can move", () => {
        expect(urlOf(linked, "en")).toMatch(/^https?:\/\/[^/]+\//);
    });

    it("leaves an address that names its own scheme alone", () => {
        expect(urlOf({ id: "x", text: { en: "x" }, url: { en: "https://elsewhere.test/a" } }, "en"))
            .toBe("https://elsewhere.test/a");
    });

    it("offers nothing for a tip with no link at all", () => {
        expect(urlOf({ id: "x", text: { en: "x" } }, "en")).toBeNull();
        expect(urlOf({ id: "x", text: { en: "x" }, url: {} }, "en")).toBeNull();
    });
});
