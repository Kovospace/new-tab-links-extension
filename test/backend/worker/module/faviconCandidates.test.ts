import { describe, expect, it } from "vitest";

import { extractFaviconCandidates } from "../../../../src/backend/worker/module/faviconCandidates";

const PAGE = "https://site.test/section/page";

describe("extractFaviconCandidates", () => {

    it("lists declared icons in order, then /favicon.ico", () => {
        const markup = `
            <link rel="stylesheet" href="/style.css">
            <link rel="icon" href="/a.png">
            <LINK REL="Shortcut Icon" HREF="b.ico">`;

        expect(extractFaviconCandidates(markup, PAGE)).toEqual([
            "https://site.test/a.png",
            "https://site.test/section/b.ico",
            "https://site.test/favicon.ico"
        ]);
    });

    it("takes icon as a whole rel token, as rel~=\"icon\" did", () => {
        const markup = `<link rel="apple-touch-icon" href="/touch.png">`;

        expect(extractFaviconCandidates(markup, PAGE)).toEqual(["https://site.test/favicon.ico"]);
    });

    it("reads single-quoted, bare and attribute-first-href tags", () => {
        const markup = `<link href='/one.png' rel='icon'><link rel=icon href=/two.png />`;

        expect(extractFaviconCandidates(markup, PAGE)).toEqual([
            "https://site.test/one.png",
            "https://site.test/two.png",
            "https://site.test/favicon.ico"
        ]);
    });

    it("decodes &amp; in an href, which a query string is written with", () => {
        const markup = `<link rel="icon" href="/icon?size=32&amp;v=2">`;

        expect(extractFaviconCandidates(markup, PAGE)[0]).toBe("https://site.test/icon?size=32&v=2");
    });

    it("keeps an absolute or data: href as it stands", () => {
        const markup = `<link rel="icon" href="https://cdn.test/i.png">`
            + `<link rel="icon" href="data:image/svg+xml,abc">`;

        expect(extractFaviconCandidates(markup, PAGE).slice(0, 2)).toEqual([
            "https://cdn.test/i.png",
            "data:image/svg+xml,abc"
        ]);
    });
});
