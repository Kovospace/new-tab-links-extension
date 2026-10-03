import { AppState, ProfileData, User } from "../../entity/AppStateEntity";
import { uid } from "../../repository/AppStateRepositoryUtils";
import { t } from "../../../i18n/i18n";

export const DEFAULT_USER: User = {
    id: "user-default",
    username: "Default"
};

export const DEFAULT_PROFILE_ID = "default";

/** Blank ProfileData used when a newly created profile has no saved data yet. */
export const emptyProfileData: ProfileData = {
    environments: {},
    groups: {},
    subgroups: {},
    links: {},
    activeEnvironmentId: null
};

/**
 *  What a browser that has never stored anything starts from: nothing.
 *
 *  It used to be a developer's test data - two groups and five "test link" entries pointing at
 *  a placeholder address - and because it held a workspace, a fresh install skipped the
 *  first-run screen and showed that to every new user. Empty, the first-run screen is what a
 *  new user meets, and it is where the examples are offered.
 */
export const appStateInit: AppState = {
    user: DEFAULT_USER,
    activeProfileId: DEFAULT_PROFILE_ID,
    ...emptyProfileData
};

/** One example link: its name and where it goes. */
interface ExampleLink {
    title: string;
    url: string;
}

/**
 *  The examples the first-run screen offers to load, built fresh each time.
 *
 *  Built rather than declared, so that every record gets a UUID of its own: identifiers are
 *  the backend's primary keys, and fixed ones would be the same on every installation that
 *  ever loaded the examples. Names are read in the user's language; addresses are sites that
 *  work wherever the reader is.
 *
 *  Laid out to show what the page does: three groups side by side, root-level links, and one
 *  subgroup sharing its group's sequence with them. The sites are ones known by the same name
 *  and at the same address in every language, so only the headings need translating.
 */
export function buildExampleProfileData(): ProfileData {
    const now = Date.now();
    const environmentId = uid();
    const data: ProfileData = {
        environments: {
            [environmentId]: {
                id: environmentId, name: t("firstRun.examples.workspace"), createdAt: now, order: 0
            }
        },
        groups: {},
        subgroups: {},
        links: {},
        activeEnvironmentId: environmentId
    };

    const addGroup = (title: string, order: number): string => {
        const id = uid();
        data.groups[id] = { id, title, environmentId, createdAt: now, order };
        return id;
    };

    const addLinks = (groupId: string, links: ExampleLink[], firstPosition: number,
                      subGroupId: string = ""): void => {
        links.forEach((link, index) => {
            const id = uid();
            data.links[id] = {
                id, title: link.title, url: link.url, groupId, subGroupId, environmentId,
                type: "link", position: firstPosition + index, createdAt: now
            };
        });
    };

    const searchLinks: ExampleLink[] = [
        { title: "Google", url: "https://www.google.com/" },
        { title: "DuckDuckGo", url: "https://duckduckgo.com/" },
        { title: "Brave Search", url: "https://search.brave.com/" },
        { title: "Yandex", url: "https://yandex.com/" },
        { title: "Bing", url: "https://www.bing.com/" }
    ];
    const search = addGroup(t("firstRun.examples.search"), 0);
    addLinks(search, searchLinks, 0);

    // After the root-level links in the sequence they share with it.
    const aiId = uid();
    data.subgroups[aiId] = {
        id: aiId, title: t("firstRun.examples.ai"),
        description: t("firstRun.examples.aiDescription"),
        groupId: search, environmentId, type: "subgroup", position: searchLinks.length,
        collapsed: false, defaultCollapsed: false, color: "blue", createdAt: now
    };
    addLinks(search, [
        { title: "ChatGPT", url: "https://chatgpt.com/" },
        { title: "Claude", url: "https://claude.ai/" },
        { title: "Gemini", url: "https://gemini.google.com/" },
        { title: "Grok", url: "https://grok.com/" }
    ], 0, aiId);

    const socials = addGroup(t("firstRun.examples.socials"), 1);
    addLinks(socials, [
        { title: "Facebook", url: "https://www.facebook.com/" },
        { title: "X (Twitter)", url: "https://x.com/" },
        { title: "LinkedIn", url: "https://www.linkedin.com/" },
        { title: "TikTok", url: "https://www.tiktok.com/" },
        { title: "Myspace", url: "https://myspace.com/" }
    ], 0);

    const music = addGroup(t("firstRun.examples.music"), 2);
    addLinks(music, [
        { title: "YouTube", url: "https://www.youtube.com/" },
        { title: "YouTube Music", url: "https://music.youtube.com/" },
        { title: "Spotify", url: "https://open.spotify.com/" },
        { title: "SoundCloud", url: "https://soundcloud.com/" },
        { title: "Bandcamp", url: "https://bandcamp.com/" }
    ], 0);

    return data;
}
