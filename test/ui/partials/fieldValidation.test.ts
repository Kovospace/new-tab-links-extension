import { describe, expect, it } from "vitest";

import { normalizeUrl, validateField, validateFields } from "../../../src/ui/partials/fieldValidation";
import { MAX_NAME_LENGTH } from "../../../src/backend/sync/SyncContracts";

/**
 *  These are the account's rules, applied before the account sees them. A name the backend
 *  refuses is not one failed record: `@Size` is validated over the whole push, so it comes
 *  back as a 400 for the entire batch and nothing is applied - and it then sits in local state
 *  stopping every other change from syncing. The dialog refusing it is what keeps it out.
 */
describe("validateField", () => {

    describe("required", () => {

        it("refuses a field that was left empty", () => {
            expect(validateField("Workspace name", "", { type: "string", required: true }))
                .toBe("Workspace name is required.");
        });

        it("refuses a field holding nothing but spaces", () => {
            // What is stored is the trimmed value, and that is empty.
            expect(validateField("Workspace name", "   ", { type: "string", required: true }))
                .toBe("Workspace name is required.");
        });

        it("accepts a field that was filled in", () => {
            expect(validateField("Workspace name", "Work", { type: "string", required: true }))
                .toBeNull();
        });

        it("lets an optional field be empty", () => {
            expect(validateField("Description", "", { type: "string" })).toBeNull();
        });
    });

    describe("maxLength", () => {

        it("refuses a value longer than the account can store", () => {
            const problem = validateField(
                "Workspace name",
                "x".repeat(MAX_NAME_LENGTH + 1),
                { type: "string", maxLength: MAX_NAME_LENGTH });

            expect(problem).toContain(String(MAX_NAME_LENGTH));
            expect(problem).toContain(String(MAX_NAME_LENGTH + 1));
        });

        it("accepts a value of exactly the maximum length", () => {
            expect(validateField(
                "Workspace name",
                "x".repeat(MAX_NAME_LENGTH),
                { type: "string", maxLength: MAX_NAME_LENGTH }))
                .toBeNull();
        });

        it("measures what would be stored, not what was typed", () => {
            // Surrounding space is dropped on the way into state, so counting it would refuse
            // a name that was always going to fit.
            expect(validateField(
                "Workspace name",
                `  ${"x".repeat(MAX_NAME_LENGTH)}  `,
                { type: "string", maxLength: MAX_NAME_LENGTH }))
                .toBeNull();
        });
    });

    describe("addresses", () => {

        it("accepts an address with no scheme, which is what people type", () => {
            expect(validateField("URL", "example.com/page", { type: "url" })).toBeNull();
        });

        it("accepts an ordinary address", () => {
            expect(validateField("URL", "https://example.com/a?b=c#d", { type: "url" }))
                .toBeNull();
        });

        it("refuses something that is not an address at all", () => {
            expect(validateField("URL", "http://", { type: "url" }))
                .toBe("URL is not a valid web address.");
        });

        it("refuses a javascript: address", () => {
            // A link is drawn as an anchor on the new tab page, which is an extension page.
            // A javascript: href clicked there runs with that page behind it.
            expect(validateField("URL", "javascript:alert(1)", { type: "url" }))
                .toBe("URL cannot use javascript addresses.");
        });

        it("refuses data: and vbscript: addresses for the same reason", () => {
            expect(validateField("URL", "data:text/html,<script>x</script>", { type: "url" }))
                .toContain("cannot use data");
            expect(validateField("URL", "vbscript:msgbox", { type: "url" }))
                .toContain("cannot use vbscript");
        });

        it("allows a file: address, which somebody may genuinely want to keep", () => {
            expect(validateField("URL", "file:///home/kovo/notes.txt", { type: "url" }))
                .toBeNull();
        });

        it("says nothing about an optional address left empty", () => {
            expect(validateField("URL", "", { type: "url" })).toBeNull();
        });
    });
});

describe("validateFields", () => {

    it("reports every field that has a problem, keyed as the caller keys them", () => {
        const problems = validateFields(
            { name: "", url: "javascript:alert(1)", description: "fine" },
            {
                name: { type: "string", required: true },
                url: { type: "url", required: true },
                description: { type: "string" }
            },
            { name: "Name", url: "URL", description: "Description" });

        expect(Object.keys(problems).sort()).toEqual(["name", "url"]);
        expect(problems.name).toBe("Name is required.");
    });

    it("reports nothing for a form that is fit to submit", () => {
        const problems = validateFields(
            { name: "Reading", url: "example.com" },
            { name: { type: "string", required: true }, url: { type: "url", required: true } },
            { name: "Name", url: "URL" });

        expect(problems).toEqual({});
    });
});

describe("normalizeUrl", () => {

    it("assumes https for an address typed without a scheme", () => {
        expect(normalizeUrl("example.com")).toBe("https://example.com");
    });

    it("leaves an address that names its scheme alone", () => {
        expect(normalizeUrl("http://example.com")).toBe("http://example.com");
    });
});
