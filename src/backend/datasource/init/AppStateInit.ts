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
 *  Laid out to show what the page does: two groups side by side, root-level links, and one
 *  subgroup sharing its group's sequence with them.
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

    const everyday = addGroup(t("firstRun.examples.everyday"), 0);
    addLinks(everyday, [
        { title: "Wikipedia", url: "https://www.wikipedia.org/" },
        { title: "YouTube", url: "https://www.youtube.com/" },
        { title: "Google Maps", url: "https://maps.google.com/" },
        { title: "Google Translate", url: "https://translate.google.com/" }
    ], 0);

    const work = addGroup(t("firstRun.examples.work"), 1);
    addLinks(work, [
        { title: "Gmail", url: "https://mail.google.com/" },
        { title: "Google Calendar", url: "https://calendar.google.com/" },
        { title: "Google Drive", url: "https://drive.google.com/" }
    ], 0);

    const developerId = uid();
    data.subgroups[developerId] = {
        id: developerId, title: t("firstRun.examples.developer"),
        description: t("firstRun.examples.developerDescription"),
        groupId: work, environmentId, type: "subgroup", position: 3,
        collapsed: false, defaultCollapsed: false, color: "blue", createdAt: now
    };
    addLinks(work, [
        { title: "GitHub", url: "https://github.com/" },
        { title: "MDN Web Docs", url: "https://developer.mozilla.org/" },
        { title: "Stack Overflow", url: "https://stackoverflow.com/" }
    ], 0, developerId);

    return data;
}
