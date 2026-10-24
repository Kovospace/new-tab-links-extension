import { ProfileData } from "../backend/entity/AppStateEntity";
import { ClosedTab } from "../backend/entity/ClosedTabEntity";
import { Visit } from "../backend/entity/VisitEntity";
import { normalizeUrl } from "../backend/worker/module/linkTabGroupCatcher";
import { foldForSearch, matchesQuery } from "../utils/textSearch";

/** Where a suggestion comes from, which is also the order they are offered in. */
export type SuggestionKind = "link" | "openTab" | "closedTab" | "visit" | "web";

/** One line under the search field. */
export interface SuggestionDTO {
    kind: SuggestionKind;
    title: string;

    /** Where it leads; null for "search the web", which is the query and not an address. */
    url: string | null;

    /**
     *  Where a link is kept - "Work › Music › Later" - or, for anything else, empty: the view
     *  names the kind itself, in the reader's language.
     */
    where: string;

    faviconUrl?: string;

    /** The tab to switch to, for an open tab. */
    tab?: { id: number; windowId: number };
}

/** Everything a query is looked for in, as it stands when the query is typed. */
export interface SuggestionInputs {
    /** The loaded profile's data - every workspace of it, never another profile's. */
    data: ProfileData;
    openTabs: chrome.tabs.Tab[];
    closedTabs: ClosedTab[];
    visits: Visit[];
}

/** How many of the profile's own things are offered at most, before "search the web". */
export const MAX_SUGGESTIONS = 8;

/**
 *  What to offer for a query: the profile's own things that match, links first, then the tabs
 *  open in this browser, the ones closed recently and the browsing history - the order in
 *  which they are what somebody typing into a new tab is most likely after.
 *
 *  An address appears once, as the first kind that has it: a page that is both a link and an
 *  open tab is offered as the link. Within a kind, a title that starts with the query comes
 *  before one that only contains its words, and that before a match on the address or on
 *  where a link is kept; the logs keep their newest first. "Search the web" is not added here -
 *  it is always there, and the view model puts it last.
 *
 *  @param query what was typed
 *  @param inputs where to look
 *  @return at most `MAX_SUGGESTIONS`, best first; none for a blank query
 */
export function gatherSuggestions(query: string, inputs: SuggestionInputs): SuggestionDTO[] {
    if (query.trim().length === 0) {
        return [];
    }

    const candidates = [
        ...ranked(query, linkSuggestions(inputs.data)),
        ...ranked(query, inputs.openTabs.filter(isWebPage).map(openTabSuggestion)),
        ...ranked(query, [...inputs.closedTabs]
            .sort((first, second) => second.closedAt - first.closedAt)
            .map(tab => logSuggestion("closedTab", tab))),
        ...ranked(query, [...inputs.visits]
            .sort((first, second) => second.visitedAt - first.visitedAt)
            .map(visit => logSuggestion("visit", visit)))
    ];

    const seen = new Set<string>();
    const offered: SuggestionDTO[] = [];
    for (const candidate of candidates) {
        const address = normalizeUrl(candidate.url!) ?? candidate.url!;
        if (seen.has(address)) {
            continue;
        }
        seen.add(address);
        offered.push(candidate);
        if (offered.length === MAX_SUGGESTIONS) {
            break;
        }
    }
    return offered;
}

/** The suggestions of one kind that match, the better matches first and otherwise in order. */
function ranked(query: string, suggestions: SuggestionDTO[]): SuggestionDTO[] {
    const folded = foldForSearch(query.trim());
    const score = (suggestion: SuggestionDTO): number => {
        const title = foldForSearch(suggestion.title);
        if (title.startsWith(folded)) return 2;
        return matchesQuery(query, suggestion.title) ? 1 : 0;
    };
    return suggestions
        .filter(suggestion => matchesQuery(query, suggestion.title, suggestion.url ?? "", suggestion.where))
        .map((suggestion, index) => ({ suggestion, index, score: score(suggestion) }))
        .sort((first, second) => second.score - first.score || first.index - second.index)
        .map(entry => entry.suggestion);
}

/** Every link of the profile, the open workspace's first, each saying where it is kept. */
function linkSuggestions(data: ProfileData): SuggestionDTO[] {
    const workspaceOrder = (workspaceId: string): number =>
        workspaceId === data.activeEnvironmentId ? -Infinity : data.environments[workspaceId]?.createdAt ?? 0;

    return Object.values(data.links)
        .filter(link => data.groups[link.groupId] !== undefined)
        .sort((first, second) =>
            workspaceOrder(first.environmentId) - workspaceOrder(second.environmentId)
            || (data.groups[first.groupId].order ?? 0) - (data.groups[second.groupId].order ?? 0)
            || first.position - second.position)
        .map(link => ({
            kind: "link" as const,
            title: link.title || link.url,
            url: link.url,
            where: [
                data.environments[link.environmentId]?.name,
                data.groups[link.groupId]?.title,
                link.subGroupId ? data.subgroups[link.subGroupId]?.title : undefined
            ].filter(part => part).join(" › ")
        }));
}

/** Only pages - not this new tab page, nor the browser's own. */
function isWebPage(tab: chrome.tabs.Tab): boolean {
    return /^(https?|file):/.test(tab.url ?? "") && tab.id !== undefined;
}

function openTabSuggestion(tab: chrome.tabs.Tab): SuggestionDTO {
    return {
        kind: "openTab",
        title: tab.title || tab.url!,
        url: tab.url!,
        where: "",
        faviconUrl: tab.favIconUrl,
        tab: { id: tab.id!, windowId: tab.windowId }
    };
}

function logSuggestion(kind: "closedTab" | "visit", entry: ClosedTab | Visit): SuggestionDTO {
    return { kind, title: entry.title || entry.url, url: entry.url, where: "", faviconUrl: entry.faviconUrl };
}
