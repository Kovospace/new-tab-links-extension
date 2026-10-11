import { currentLocaleTag, t } from "./i18n";

/**
 *  Writing a date the way the reader's part of the world writes it.
 *
 *  **The language and the date format are two different questions**, which is why they are two
 *  settings. A Slovak reader in Slovakia writes 3. 9. 2026; a Slovak reader working on an
 *  American team may well want 9/3/2026 in front of them all day; and an English reader in
 *  Britain wants neither of the two orders an American would offer them. So the language picks
 *  the words and this picks the order, and "local custom" - the default - takes the order from
 *  the browser's own region rather than from either.
 *
 *  Everything here goes through `Intl`, which is the browser's own table of these customs and
 *  needs no dependency, no data file and no upkeep.
 */

/** The ways a date may be written here. */
export type DateFormatId =
    | "auto"
    | "dayMonthYearDots"
    | "dayMonthYearSlashes"
    | "monthDayYearSlashes"
    | "isoDashes";

/** What a device that has never been asked writes: whatever its region writes. */
export const DEFAULT_DATE_FORMAT: DateFormatId = "auto";

/** Every format on offer, in the order the settings dialog lists them. */
export const DATE_FORMATS: ReadonlyArray<DateFormatId> = [
    "auto",
    "dayMonthYearDots",
    "dayMonthYearSlashes",
    "monthDayYearSlashes",
    "isoDashes"
];

/** The format in force. Set at startup beside the language, from the device preferences. */
let dateFormat: DateFormatId = DEFAULT_DATE_FORMAT;

/**
 *  Chooses how dates are written on this page.
 *
 *  @param stored what the device preference holds; anything unrecognised means local custom
 *  @return the format actually in force
 */
export function setDateFormat(stored?: string | null): DateFormatId {
    dateFormat = normalizeDateFormat(stored);
    return dateFormat;
}

/** The format in force. */
export function currentDateFormat(): DateFormatId {
    return dateFormat;
}

/**
 *  The nearest format this actually offers.
 *
 *  Storage can hold a format this version does not have - written by a newer one, or edited by
 *  hand - and the answer to that is the reader's own region, never a crash and never a key.
 */
export function normalizeDateFormat(value?: string | null): DateFormatId {
    return DATE_FORMATS.includes(value as DateFormatId)
        ? value as DateFormatId
        : DEFAULT_DATE_FORMAT;
}

/**
 *  A date, written the way this device is set to write them.
 *
 *  @param when the moment to write; a `Date` or epoch milliseconds
 */
export function formatDate(when: Date | number): string {

    const date = when instanceof Date ? when : new Date(when);

    if (dateFormat === "auto") {
        return new Intl.DateTimeFormat(currentLocaleTag(), { dateStyle: "medium" }).format(date);
    }

    const day = String(date.getDate());
    const month = String(date.getMonth() + 1);
    const year = String(date.getFullYear());

    switch (dateFormat) {
        // The spaces are not decoration: 3. 9. 2026 is how this order is written where it is
        // used, and 3.9.2026 reads as a version number.
        case "dayMonthYearDots":
            return `${day}. ${month}. ${year}`;
        case "dayMonthYearSlashes":
            return `${pad(day)}/${pad(month)}/${year}`;
        case "monthDayYearSlashes":
            return `${pad(month)}/${pad(day)}/${year}`;
        case "isoDashes":
            return `${year}-${pad(month)}-${pad(day)}`;
    }
}

/**
 *  A time of day, always the way the region writes it.
 *
 *  Deliberately not a setting of its own. Whether a clock has twelve hours or twenty-four is
 *  decided by the same region the date order is, and offering it separately would be a third
 *  question to answer for something nobody has ever wanted answered differently.
 */
export function formatTime(when: Date | number): string {
    const date = when instanceof Date ? when : new Date(when);
    return new Intl.DateTimeFormat(currentLocaleTag(), { timeStyle: "short" }).format(date);
}

/** A date and the time on it, in that order, as one line. */
export function formatDateTime(when: Date | number): string {
    return `${formatDate(when)} ${formatTime(when)}`;
}

/**
 *  How a format writes one particular day, for the settings dialog to show beside its name.
 *
 *  A name for a date order is a riddle - "day month year" describes three of the five on offer
 *  - and an example is the answer to it. The date is a real one rather than today's, so that
 *  every part of it is unambiguous: the 9th of March could be read either way round, and
 *  a sample nobody can read backwards is the only kind worth showing.
 */
export function sampleOf(format: DateFormatId): string {
    const was = dateFormat;
    dateFormat = format;
    try {
        return formatDate(new Date(2026, 2, 25));
    } finally {
        dateFormat = was;
    }
}

/**
 *  How long ago something happened, in the coarsest unit that still says something.
 *
 *  Worded through the catalogue, and the counts are plural entries rather than a number and a
 *  noun stuck together: English needs "an hour ago" where it would otherwise say "1 hours ago",
 *  and Slovak needs a different word for two, three and four than for five.
 *
 *  @param milliseconds how long ago; negative is treated as just now
 */
export function describeAge(milliseconds: number): string {

    const minutes = Math.floor(milliseconds / 60_000);

    if (minutes < 1) {
        return t("dates.age.justNow");
    }
    if (minutes < 60) {
        return t("dates.age.minutes", { count: minutes });
    }

    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
        return t("dates.age.hours", { count: hours });
    }

    const days = Math.floor(hours / 24);
    return t("dates.age.days", { count: days });
}

/**
 *  How long ago something happened, followed by when exactly, in brackets.
 *
 *  The exact part is only the time when it happened today, and the date with the time when it
 *  happened on any earlier day - **by the calendar, not by the hours elapsed**. Ten minutes
 *  before midnight is "an hour ago" a little after one in the morning, and a bare "23:50" next
 *  to that reads as tonight's, which has not happened yet.
 *
 *  @param when the moment it happened, epoch milliseconds
 *  @param now  the moment to measure from; a parameter so that "today" can be tested
 */
export function describeMoment(when: number, now: number = Date.now()): string {
    const exact = isSameDay(when, now) ? formatTime(when) : formatDateTime(when);
    return t("dates.ageAt", { age: describeAge(now - when), at: exact });
}

/** Whether two moments fall on the same calendar day here, in the device's own time zone. */
function isSameDay(first: number, second: number): boolean {
    const a = new Date(first);
    const b = new Date(second);
    return a.getFullYear() === b.getFullYear()
        && a.getMonth() === b.getMonth()
        && a.getDate() === b.getDate();
}

function pad(value: string): string {
    return value.padStart(2, "0");
}
