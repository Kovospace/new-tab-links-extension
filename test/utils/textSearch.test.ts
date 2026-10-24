import { describe, expect, it } from "vitest";

import { matchesQuery } from "../../src/utils/textSearch";

/** What the side panel's search field counts as a match. */
describe("matchesQuery", () => {

    it("matches everything while nothing is typed", () => {
        expect(matchesQuery("", "Anything")).toBe(true);
        expect(matchesQuery("   ", "Anything")).toBe(true);
    });

    it("wants every word, in any order, from any of the texts", () => {
        expect(matchesQuery("github pull", "Pull requests", "https://github.com/x/pulls")).toBe(true);
        expect(matchesQuery("pull github", "Pull requests", "https://github.com/x/pulls")).toBe(true);
        expect(matchesQuery("github issues", "Pull requests", "https://github.com/x/pulls")).toBe(false);
    });

    it("ignores case and accents on both sides", () => {
        expect(matchesQuery("kosice", "Počasie Košice")).toBe(true);
        expect(matchesQuery("KOŠICE", "pocasie kosice")).toBe(true);
    });

    it("skips a text that is missing", () => {
        expect(matchesQuery("title", undefined, "A title")).toBe(true);
    });
});
