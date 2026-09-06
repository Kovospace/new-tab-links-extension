import { describe, expect, it } from "vitest";

import { findCatchingSubgroup, normalizeUrl } from "./linkTabGroupCatcher";
import { AppState } from "../../entity/AppStateEntity";
import { environment, group, link, profileOf, subgroup } from "../../../test/profileDataFixtures";

const ENV = "env-work";
const GROUP = "grp-one";

/**
 *  A profile with two subgroups - one catching, one not - and a root-level link besides.
 */
function state(): AppState {
    return {
        user: { id: "u", username: "u" },
        activeProfileId: "p",
        ...profileOf({
            environments: [environment(ENV, "Work")],
            groups: [group(GROUP, "One", ENV)],
            subgroups: [
                subgroup("sub-catching", "Reading", GROUP, ENV, 0,
                    { catchLinksIntoTabGroup: true }),
                subgroup("sub-quiet", "Later", GROUP, ENV, 1)
            ],
            links: [
                link("lnk-caught", "Docs", "https://docs.test/guide", GROUP, ENV,
                    { subGroupId: "sub-catching" }),
                link("lnk-bare", "Bare", "https://bare.test", GROUP, ENV,
                    { subGroupId: "sub-catching" }),
                link("lnk-quiet", "Quiet", "https://quiet.test/page", GROUP, ENV,
                    { subGroupId: "sub-quiet" }),
                link("lnk-root", "Root", "https://root.test/page", GROUP, ENV)
            ],
            activeEnvironmentId: ENV
        })
    };
}

/**
 *  Which subgroup, if any, claims a tab. This decides whether a tab the user opened
 *  somewhere else in the browser is moved out from under them, so the cost of matching too
 *  eagerly is higher than the cost of missing a match.
 */
describe("findCatchingSubgroup", () => {

    it("claims a link of a subgroup that asked to catch its links", () => {
        expect(findCatchingSubgroup(state(), "https://docs.test/guide")?.id).toBe("sub-catching");
    });

    it("recognises the link after the address bar has added the trailing slash", () => {
        // A link stored as "https://bare.test" is reported by chrome.tabs as
        // "https://bare.test/". Comparing the two as written never matches.
        expect(findCatchingSubgroup(state(), "https://bare.test/")?.id).toBe("sub-catching");
    });

    it("ignores the fragment, which names a place inside the same page", () => {
        expect(findCatchingSubgroup(state(), "https://docs.test/guide#install")?.id)
            .toBe("sub-catching");
    });

    it("treats a different query string as a different page", () => {
        expect(findCatchingSubgroup(state(), "https://docs.test/guide?v=2")).toBeNull();
    });

    it("leaves alone a link of a subgroup that did not ask", () => {
        expect(findCatchingSubgroup(state(), "https://quiet.test/page")).toBeNull();
    });

    it("leaves alone a link that is not in any subgroup", () => {
        expect(findCatchingSubgroup(state(), "https://root.test/page")).toBeNull();
    });

    it("leaves alone an address nothing was stored for", () => {
        expect(findCatchingSubgroup(state(), "https://elsewhere.test/")).toBeNull();
    });

    it("never claims a page that is not on the web", () => {
        // The extension's own pages included: matching one would mean grabbing a tab the
        // setting was never about.
        expect(findCatchingSubgroup(state(), "chrome://extensions")).toBeNull();
        expect(findCatchingSubgroup(state(), "about:blank")).toBeNull();
    });

    it("reads a subgroup stored before this setting existed as not catching", () => {
        // Every subgroup already in storage has no such field at all.
        const stored = state();
        delete stored.subgroups["sub-catching"].catchLinksIntoTabGroup;

        expect(findCatchingSubgroup(stored, "https://docs.test/guide")).toBeNull();
    });
});

describe("normalizeUrl", () => {

    it("keeps two hosts apart however they are written", () => {
        expect(normalizeUrl("https://Docs.Test/Guide")).toBe("https://docs.test/Guide");
    });

    it("refuses what it cannot parse", () => {
        expect(normalizeUrl("not a url")).toBeNull();
    });
});
