import { describe, expect, it } from "vitest";

import { gatherSuggestions, MAX_SUGGESTIONS, SuggestionInputs } from "../../src/viewModel/searchSuggestions";
import { environment, group, link, profileOf, subgroup } from "../support/profileDataFixtures";

const tab = (id: number, url: string, title: string): chrome.tabs.Tab =>
    ({ id, windowId: 1, url, title, index: id } as chrome.tabs.Tab);

function inputs(parts: Partial<SuggestionInputs> = {}): SuggestionInputs {
    return {
        data: profileOf({
            environments: [environment("work", "Work"), environment("home", "Home")],
            groups: [group("music", "Music", "work"), group("news", "News", "home")],
            subgroups: [subgroup("later", "Later", "music", "work")],
            links: [
                link("l-radio", "Radio Devín", "https://devin.rtvs.sk/", "music", "work"),
                link("l-spotify", "Spotify", "https://open.spotify.com/", "music", "work", { subGroupId: "later", position: 1 }),
                link("l-sme", "SME denník", "https://www.sme.sk/", "news", "home")
            ],
            activeEnvironmentId: "work"
        }),
        openTabs: [],
        closedTabs: [],
        visits: [],
        ...parts
    };
}

const titles = (query: string, parts?: Partial<SuggestionInputs>) =>
    gatherSuggestions(query, inputs(parts)).map(suggestion => suggestion.title);

/** What the search bar offers, before "search the web", for what was typed. */
describe("gatherSuggestions", () => {

    it("offers nothing for a blank query", () => {
        expect(gatherSuggestions("  ", inputs())).toEqual([]);
    });

    it("finds links in every workspace of the profile, saying where each is kept", () => {
        const found = gatherSuggestions("sk", inputs());

        expect(found.map(suggestion => suggestion.title)).toEqual(["Radio Devín", "SME denník"]);
        expect(found.map(suggestion => suggestion.where)).toEqual(["Work › Music", "Home › News"]);
    });

    it("matches where a link is kept, so the name of a group finds its links", () => {
        expect(titles("later")).toEqual(["Spotify"]);
        expect(gatherSuggestions("later", inputs())[0].where).toBe("Work › Music › Later");
    });

    it("puts links first, then open tabs, closed tabs and the history", () => {
        expect(titles("news", {
            visits: [{ id: "v", url: "https://news.test/v", title: "News visited", visitedAt: 3 }],
            closedTabs: [{ id: "c", url: "https://news.test/c", title: "News closed", closedAt: 2 }],
            openTabs: [tab(7, "https://news.test/o", "News open")]
        })).toEqual(["SME denník", "News open", "News closed", "News visited"]);
    });

    it("offers an address once, as the first kind that has it", () => {
        const found = gatherSuggestions("spotify", inputs({
            openTabs: [tab(7, "https://open.spotify.com", "Spotify - Web Player")],
            visits: [{ id: "v", url: "https://open.spotify.com/", title: "Spotify", visitedAt: 1 }]
        }));

        expect(found.map(suggestion => suggestion.kind)).toEqual(["link"]);
    });

    it("ranks a title that starts with the query above one that only contains it", () => {
        expect(titles("de", {
            visits: [
                { id: "a", url: "https://a.test/", title: "Code review", visitedAt: 2 },
                { id: "b", url: "https://b.test/", title: "Deploy log", visitedAt: 1 }
            ]
        }).slice(-2)).toEqual(["Deploy log", "Code review"]);
    });

    it("leaves out tabs that are not pages, this new tab page among them", () => {
        expect(titles("tab", {
            openTabs: [
                tab(1, "chrome://newtab/", "New tab"),
                tab(2, "chrome-extension://abc/index.html", "New tab"),
                tab(3, "https://tabs.test/", "A tab")
            ]
        })).toEqual(["A tab"]);
    });

    it("offers no more than it has room for", () => {
        const visits = Array.from({ length: 20 }, (_, index) =>
            ({ id: `v${index}`, url: `https://many.test/${index}`, title: `Many ${index}`, visitedAt: index }));

        expect(titles("many", { visits })).toHaveLength(MAX_SUGGESTIONS);
        expect(titles("many", { visits })[0]).toBe("Many 19");
    });
});
