import { AppState, User } from "../../entity/AppStateEntity";

export const DEFAULT_USER: User = {
    id: "user-default",
    username: "Default"
};

export const DEFAULT_PROFILE_ID = "default";

/**
 *  Správne vyrenderovanie testovacích dát:
 *
 *  - test link 1
 *  - testovacia podskupina 1
 *    - test link 2
 *  - test link 3
 */

export const appStateInit: AppState = {
    user: DEFAULT_USER,
    activeProfileId: DEFAULT_PROFILE_ID,
    activeEnvironmentId: "env-1",
    environments: {
        "env-1": {
            id: "env-1",
            name: "Default",
            createdAt: 0,
            order: 0
        }
    },
    groups: {
        "group-1": {
            id: "group-1",
            environmentId: "env-1",
            title: "Work"
        },
        "group-2": {
            id: "group-2",
            environmentId: "env-1",
            title: "Personal"
        }
    },
    subgroups: {
        "subgroup-1": {
            id: "subgroup-1",
            title: "Testovacia podskupina 1",
            description: "Popis sub group 1",
            groupId: "group-1",
            environmentId: "env-1",
            collapsed: false,
            defaultCollapsed: false,
            type: "subgroup",
            position: 1
        }
    },
    links: {
        "test-link-1": {
            title: "test link 1",
            id: "test-link-1",
            subGroupId: "",
            groupId: "group-1",
            environmentId: "env-1",
            url: "http://kokot.do.pici",
            type: "link",
            position: 0
        },
        "test-link-2": {
            title: "test link 2",
            id: "test-link-2",
            subGroupId: "subgroup-1",
            groupId: "group-1",
            environmentId: "env-1",
            url: "http://kokot.do.pici",
            type: "link",
            position: 0
        },
        "test-link-3": {
            title: "test-link-3",
            id: "test-link-3",
            subGroupId: "",
            groupId: "group-1",
            environmentId: "env-1",
            url: "http://kokot.do.pici",
            type: "link",
            position: 2
        },
        "test-link-4": {
            title: "test-link-4",
            id: "test-link-4",
            subGroupId: "",
            groupId: "group-1",
            environmentId: "env-1",
            url: "http://kokot.do.pici",
            type: "link",
            position: 3
        },
        "test-link-5": {
            title: "test-link-5",
            id: "test-link-5",
            subGroupId: "",
            groupId: "group-1",
            environmentId: "env-1",
            url: "http://kokot.do.pici",
            type: "link",
            position: 4
        }
    }
};
