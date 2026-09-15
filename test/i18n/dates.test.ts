import { beforeEach, describe, expect, it } from "vitest";

import {
    DEFAULT_DATE_FORMAT, describeAge, formatDate, normalizeDateFormat, sampleOf, setDateFormat
} from "../../src/i18n/dates";
import { setLanguage } from "../../src/i18n/i18n";
import { AUTOMATIC_LANGUAGE } from "../../src/i18n/languages";

/** Pretends the browser is set to a language, the way `chrome.i18n` would report it. */
function browserSetTo(tag: string): void {
    (globalThis as { chrome?: unknown }).chrome = {
        i18n: { getUILanguage: () => tag }
    };
}

beforeEach(() => {
    browserSetTo("en-GB");
    setLanguage(AUTOMATIC_LANGUAGE);
    setDateFormat(DEFAULT_DATE_FORMAT);
});

/**
 *  How long ago something happened, which is the one piece of arithmetic the closed tabs panel
 *  does and the one that reads wrong in a way nobody notices until it is on screen.
 */
describe("describeAge", () => {

    it("says just now for anything under a minute", () => {
        expect(describeAge(0)).toBe("just now");
        expect(describeAge(59_000)).toBe("just now");
    });

    it("counts minutes up to the hour", () => {
        expect(describeAge(60_000)).toBe("1 min ago");
        expect(describeAge(59 * 60_000)).toBe("59 min ago");
    });

    it("says an hour rather than 1 hours", () => {
        expect(describeAge(60 * 60_000)).toBe("an hour ago");
        expect(describeAge(2 * 60 * 60_000)).toBe("2 hours ago");
    });

    it("turns into days, and yesterday is not 1 days", () => {
        expect(describeAge(24 * 60 * 60_000)).toBe("yesterday");
        expect(describeAge(3 * 24 * 60 * 60_000)).toBe("3 days ago");
    });

    it("is worded in the chosen language", () => {
        setLanguage("sk");
        expect(describeAge(0)).toBe("práve teraz");
        expect(describeAge(3 * 24 * 60 * 60_000)).toBe("pred 3 dňami");
    });
});

describe("writing a date", () => {

    const day = new Date(2026, 8, 3, 14, 5);

    it("writes the parts in the order the chosen format asks for", () => {
        setDateFormat("dayMonthYearDots");
        expect(formatDate(day)).toBe("3. 9. 2026");

        setDateFormat("dayMonthYearSlashes");
        expect(formatDate(day)).toBe("03/09/2026");

        setDateFormat("monthDayYearSlashes");
        expect(formatDate(day)).toBe("09/03/2026");

        setDateFormat("isoDashes");
        expect(formatDate(day)).toBe("2026-09-03");
    });

    /**
     *  The two orders that differ only in which number comes first are the whole reason the
     *  setting exists, and the whole reason a chosen format may not quietly become another.
     */
    it("does not confuse day-first with month-first", () => {
        setDateFormat("dayMonthYearSlashes");
        const dayFirst = formatDate(day);
        setDateFormat("monthDayYearSlashes");
        expect(formatDate(day)).not.toBe(dayFirst);
    });

    it("takes local custom from the browser's region", () => {
        browserSetTo("en-US");
        setLanguage(AUTOMATIC_LANGUAGE);
        setDateFormat("auto");
        // Month before day is what that region writes, and it is not what en-GB writes.
        const american = formatDate(day);

        browserSetTo("en-GB");
        setLanguage(AUTOMATIC_LANGUAGE);
        expect(formatDate(day)).not.toBe(american);
    });

    /**
     *  Storage can hold a format this build does not have. Reading it as itself would leave
     *  `formatDate` falling off the end of its own switch and returning nothing.
     */
    it("treats a format it does not have as local custom", () => {
        expect(normalizeDateFormat("shortWeekdayThing")).toBe(DEFAULT_DATE_FORMAT);
        expect(normalizeDateFormat(undefined)).toBe(DEFAULT_DATE_FORMAT);
        setDateFormat("shortWeekdayThing");
        expect(formatDate(day)).not.toBe("");
    });

    /**
     *  The sample is shown beside every format in the settings dialog, while one of them is in
     *  force. Leaving the chosen one changed would make opening that dialog silently reformat
     *  every date on the page behind it.
     */
    it("leaves the format in force alone while producing a sample of another", () => {
        setDateFormat("isoDashes");
        expect(sampleOf("monthDayYearSlashes")).toBe("03/25/2026");
        expect(formatDate(day)).toBe("2026-09-03");
    });
});
