import { beforeEach, describe, expect, it } from "vitest";

import { AppStateRepository } from "../../../src/backend/repository/AppStateRepository";
import { ProfileRepository } from "../../../src/backend/repository/ProfileRepository";
import { appStateInit } from "../../../src/backend/datasource/init/AppStateInit";
import { environment, group, link, profileOf, subgroup } from "../../support/profileDataFixtures";
import { appStateKey } from "../../../src/backend/datasource/chromeStorage/storageKeys";
import { flushStorageNotifications, readFakeStorage } from "../../support/chromeStorageStub";
import { AppState } from "../../../src/backend/entity/AppStateEntity";

const OTHER = "0199bbbb-0000-7000-8000-00000000000b";

/**
 *  Which workspace to show is the decision main.ts makes to choose between the application and
 *  the first-run screen, so getting it wrong does not degrade the page - it replaces it.
 */
describe("AppStateRepository.getCurrentEnvironment", () => {

    let profiles: ProfileRepository;
    let appState: AppStateRepository;

    beforeEach(async () => {
        profiles = new ProfileRepository();
        await profiles.init();

        appState = new AppStateRepository();
        await appState.init(appStateInit, profiles.getActiveProfileId());
    });

    it("opens the first workspace of a profile that names none as active", async () => {
        // The regression. A profile pulled from the account arrives with no opinion about
        // which workspace is open - that choice is per-device and deliberately not
        // synchronised - so activeEnvironmentId is null while the profile is full of
        // workspaces. This used to report "no workspace", main.ts read that as a first run,
        // and the reload guard on that screen then reloaded the page several times a second.
        await profiles.upsertProfile({ id: OTHER, name: "Pulled", createdAt: 0 });
        await appState.saveProfileData(OTHER, profileOf({
            environments: [environment("env-a", "Work")],
            activeEnvironmentId: null
        }));

        await appState.switchProfile(OTHER);

        expect(appState.getCurrentEnvironment()?.id).toBe("env-a");
    });

    it("opens a workspace that exists when the active one has been deleted elsewhere", async () => {
        await profiles.upsertProfile({ id: OTHER, name: "Pulled", createdAt: 0 });
        await appState.saveProfileData(OTHER, profileOf({
            environments: [environment("env-a", "Work")],
            activeEnvironmentId: "env-deleted-on-another-device"
        }));

        await appState.switchProfile(OTHER);

        expect(appState.getCurrentEnvironment()?.id).toBe("env-a");
    });

    it("still reports no workspace when the profile genuinely has none", async () => {
        // The first-run screen has to stay reachable; this is the case that legitimately
        // reaches it.
        await profiles.upsertProfile({ id: OTHER, name: "Empty", createdAt: 0 });
        await appState.saveProfileData(OTHER, profileOf({ activeEnvironmentId: null }));

        await appState.switchProfile(OTHER);

        expect(appState.getCurrentEnvironment()).toBeNull();
    });

    it("keeps the workspace the profile does name as active", async () => {
        await profiles.upsertProfile({ id: OTHER, name: "Pulled", createdAt: 0 });
        await appState.saveProfileData(OTHER, profileOf({
            environments: [environment("env-a", "Work"), environment("env-b", "Home")],
            activeEnvironmentId: "env-b"
        }));

        await appState.switchProfile(OTHER);

        expect(appState.getCurrentEnvironment()?.id).toBe("env-b");
    });
});

/**
 *  Moving a group between workspaces is the one operation that changes which workspace a
 *  record belongs to after it was created, and three separate maps record that membership.
 */
describe("AppStateRepository.moveGroupToWorkspace", () => {

    const WORK = "0199bbbb-0000-7000-8000-0000000000a1";
    const HOME = "0199bbbb-0000-7000-8000-0000000000a2";

    let profiles: ProfileRepository;
    let appState: AppStateRepository;

    /** A profile with two workspaces, and one group of links and subgroups in the first. */
    beforeEach(async () => {
        profiles = new ProfileRepository();
        await profiles.init();

        appState = new AppStateRepository();
        await appState.init(appStateInit, profiles.getActiveProfileId());

        await profiles.upsertProfile({ id: OTHER, name: "Migrating", createdAt: 0 });
        await appState.saveProfileData(OTHER, profileOf({
            environments: [environment("env-work", "Work"), environment("env-home", "Home", 1)],
            groups: [
                group("grp-one", "One", "env-work", 0),
                group("grp-two", "Two", "env-work", 1),
                group("grp-three", "Three", "env-work", 2),
                group("grp-home", "Already home", "env-home", 0)
            ],
            subgroups: [subgroup("sub-one", "Nested", "grp-one", "env-work")],
            links: [
                link("lnk-root", "Root", "https://root.example", "grp-one", "env-work"),
                link("lnk-nested", "Nested", "https://nested.example", "grp-one", "env-work",
                    { subGroupId: "sub-one" })
            ],
            activeEnvironmentId: "env-work"
        }));
        await appState.switchProfile(OTHER);
    });

    it("takes the group's subgroups and links with it", async () => {
        // The regression this guards. A subgroup and a link repeat their group's
        // environmentId rather than deriving it, and the group body is filtered on that
        // field - so moving only the group emptied it on arrival and stranded its links in
        // the workspace it left, where nothing renders them either.
        const state = await appState.moveGroupToWorkspace("grp-one", "env-home");

        expect(state.groups["grp-one"].environmentId).toBe("env-home");
        expect(state.subgroups["sub-one"].environmentId).toBe("env-home");
        expect(state.links["lnk-root"].environmentId).toBe("env-home");
        expect(state.links["lnk-nested"].environmentId).toBe("env-home");
    });

    it("puts the group at the end of the target workspace", async () => {
        const state = await appState.moveGroupToWorkspace("grp-two", "env-home");

        expect(state.groups["grp-two"].order).toBe(1);
        expect(state.groups["grp-home"].order).toBe(0);
    });

    it("closes the gap the group leaves behind", async () => {
        const state = await appState.moveGroupToWorkspace("grp-one", "env-home");

        expect(state.groups["grp-two"].order).toBe(0);
        expect(state.groups["grp-three"].order).toBe(1);
    });

    it("leaves the group where it is when the target workspace does not exist", async () => {
        const state = await appState.moveGroupToWorkspace("grp-one", "env-deleted-elsewhere");

        expect(state.groups["grp-one"].environmentId).toBe("env-work");
        expect(state.links["lnk-root"].environmentId).toBe("env-work");
    });

    it("changes nothing when the group is already in the target workspace", async () => {
        const before = appState.state$.get();

        const state = await appState.moveGroupToWorkspace("grp-one", "env-work");

        expect(state.groups).toEqual(before.groups);
    });
});

/**
 *  Root-level links and subgroups of a group are one sequence, numbered by a single
 *  `position` field. Reordering either kind has to account for the other, which is the part
 *  that was missing: a link asked to step up swapped positions with the next link and walked
 *  straight through the subgroup standing between them.
 */
describe("AppStateRepository root-level ordering", () => {

    const GROUP = "grp-one";
    const ENV = "env-work";

    let profiles: ProfileRepository;
    let appState: AppStateRepository;

    /** The order a group renders its root-level items in: by position, links before subgroups. */
    function renderedOrder(state = appState.state$.get()): string[] {
        return [
            ...Object.values(state.links).filter(l => l.groupId === GROUP && !l.subGroupId),
            ...Object.values(state.subgroups).filter(sg => sg.groupId === GROUP)
        ]
            .sort((a, b) => a.position - b.position)
            .map(item => item.id);
    }

    /**
     *  A group holding a link, then a subgroup of two links, then another link - the shape
     *  the bug was reported against.
     */
    async function seedGroup(subgroupPosition: number, secondLinkPosition: number) {
        await profiles.upsertProfile({ id: OTHER, name: "Ordering", createdAt: 0 });
        await appState.saveProfileData(OTHER, profileOf({
            environments: [environment(ENV, "Work")],
            groups: [group(GROUP, "One", ENV, 0)],
            subgroups: [subgroup("sub-one", "Nested", GROUP, ENV, subgroupPosition)],
            links: [
                link("lnk-one", "One", "https://one.example", GROUP, ENV, { position: 0 }),
                link("lnk-two", "Two", "https://two.example", GROUP, ENV,
                    { position: secondLinkPosition }),
                link("nested-one", "Nested one", "https://n1.example", GROUP, ENV,
                    { subGroupId: "sub-one", position: 0 }),
                link("nested-two", "Nested two", "https://n2.example", GROUP, ENV,
                    { subGroupId: "sub-one", position: 1 })
            ],
            activeEnvironmentId: ENV
        }));
        await appState.switchProfile(OTHER);
    }

    beforeEach(async () => {
        profiles = new ProfileRepository();
        await profiles.init();

        appState = new AppStateRepository();
        await appState.init(appStateInit, profiles.getActiveProfileId());
    });

    it("moves a link up past the subgroup standing between it and the link above", async () => {
        // The regression. Only links were renumbered, so the link took the position the
        // subgroup already held instead of the subgroup's place in the sequence. The two
        // links then shared a position with the subgroup and swapped between themselves on
        // every further move, while the subgroup never budged.
        await seedGroup(1, 2);

        const state = await appState.moveLinkUp("lnk-two");

        expect(renderedOrder(state)).toEqual(["lnk-one", "lnk-two", "sub-one"]);
        expect([
            state.links["lnk-one"].position,
            state.links["lnk-two"].position,
            state.subgroups["sub-one"].position
        ]).toEqual([0, 1, 2]);
    });

    it("moves a link down past the subgroup standing below it", async () => {
        await seedGroup(1, 2);

        const state = await appState.moveLinkDown("lnk-one");

        expect(renderedOrder(state)).toEqual(["sub-one", "lnk-one", "lnk-two"]);
    });

    it("leaves the links inside the subgroup alone when a root-level link moves", async () => {
        // Root-level repositioning selected every link of the group, subgroup members
        // included, and shifted their positions too - reordering the inside of a subgroup
        // nobody had touched.
        await seedGroup(1, 2);

        const state = await appState.moveLinkUp("lnk-two");

        expect(state.links["nested-one"].position).toBe(0);
        expect(state.links["nested-two"].position).toBe(1);
    });

    it("orders a group whose subgroup was stored at position 0 alongside a link", async () => {
        // Subgroups were created at position 0 whatever the group already held, so real
        // stored data has a subgroup and a link claiming the same place. A move has to
        // renumber the sequence rather than assume it is already 0..n-1.
        await seedGroup(0, 2);

        const state = await appState.moveLinkUp("lnk-two");

        expect(renderedOrder(state)).toEqual(["lnk-one", "lnk-two", "sub-one"]);
        expect([
            state.links["lnk-one"].position,
            state.links["lnk-two"].position,
            state.subgroups["sub-one"].position
        ]).toEqual([0, 1, 2]);
    });

    it("moves a subgroup down past a link", async () => {
        await seedGroup(1, 2);

        const state = await appState.moveSubgroupDown("sub-one");

        expect(renderedOrder(state)).toEqual(["lnk-one", "lnk-two", "sub-one"]);
    });

    it("keeps the last item where it is", async () => {
        await seedGroup(1, 2);

        const state = await appState.moveLinkDown("lnk-two");

        expect(renderedOrder(state)).toEqual(["lnk-one", "sub-one", "lnk-two"]);
    });

    it("keeps the first item where it is", async () => {
        await seedGroup(1, 2);

        const state = await appState.moveLinkUp("lnk-one");

        expect(renderedOrder(state)).toEqual(["lnk-one", "sub-one", "lnk-two"]);
    });

    it("reorders links within a subgroup among themselves", async () => {
        await seedGroup(1, 2);

        const state = await appState.moveLinkDown("nested-one");

        expect(state.links["nested-one"].position).toBe(1);
        expect(state.links["nested-two"].position).toBe(0);
    });

    it("puts a new subgroup behind the links already in the group", async () => {
        // It used to be created at position 0, in front of everything.
        await seedGroup(1, 2);

        const state = await appState.createSubGroup(GROUP, ENV, "Later");

        const created = Object.values(state.subgroups).find(sg => sg.title === "Later")!;
        expect(created.position).toBe(3);
    });

    it("puts a new root-level link behind the subgroups already in the group", async () => {
        // Only links were counted, so a new link landed on the subgroup's position.
        await seedGroup(2, 1);

        const state = await appState.createLink("https://three.example", "Three", GROUP);

        const created = Object.values(state.links).find(l => l.title === "Three")!;
        expect(created.position).toBe(3);
    });
});

/**
 *  A subgroup can ask that tabs landing on its links join its tab group. The setting is read
 *  by the background service worker straight out of storage, so what matters here is that it
 *  is written, that it survives, and that a subgroup starts without it.
 */
describe("AppStateRepository.toggleSubgroupCatchLinksIntoTabGroup", () => {

    const ENV = "env-work";
    const GROUP = "grp-one";

    let profiles: ProfileRepository;
    let appState: AppStateRepository;

    beforeEach(async () => {
        profiles = new ProfileRepository();
        await profiles.init();

        appState = new AppStateRepository();
        await appState.init(appStateInit, profiles.getActiveProfileId());

        await profiles.upsertProfile({ id: OTHER, name: "Catching", createdAt: 0 });
        await appState.saveProfileData(OTHER, profileOf({
            environments: [environment(ENV, "Work")],
            groups: [group(GROUP, "One", ENV, 0)],
            subgroups: [subgroup("sub-one", "Reading", GROUP, ENV)],
            activeEnvironmentId: ENV
        }));
        await appState.switchProfile(OTHER);
    });

    it("turns the setting on and off again", async () => {
        const on = await appState.toggleSubgroupCatchLinksIntoTabGroup("sub-one");
        expect(on.subgroups["sub-one"].catchLinksIntoTabGroup).toBe(true);

        const off = await appState.toggleSubgroupCatchLinksIntoTabGroup("sub-one");
        expect(off.subgroups["sub-one"].catchLinksIntoTabGroup).toBe(false);
    });

    it("turns on a subgroup stored before the setting existed", async () => {
        // Nothing in storage carries the field yet, and undefined is not false to a toggle
        // written carelessly.
        const stored = appState.state$.get();
        delete stored.subgroups["sub-one"].catchLinksIntoTabGroup;

        const state = await appState.toggleSubgroupCatchLinksIntoTabGroup("sub-one");

        expect(state.subgroups["sub-one"].catchLinksIntoTabGroup).toBe(true);
    });

    it("creates a subgroup with the setting off", async () => {
        // The user asked for this default explicitly: a new subgroup must not start
        // capturing tabs from around the browser.
        const state = await appState.createSubGroup(GROUP, ENV, "Fresh");

        const created = Object.values(state.subgroups).find(sg => sg.title === "Fresh")!;
        expect(created.catchLinksIntoTabGroup).toBe(false);
    });

    it("does nothing for a subgroup that is not there", async () => {
        const before = appState.state$.get();

        const state = await appState.toggleSubgroupCatchLinksIntoTabGroup("sub-deleted-elsewhere");

        expect(state.subgroups).toEqual(before.subgroups);
    });
});


/**
 *  Two pages of this extension can now hold the same profile at once: the new tab page and the
 *  small window the bookmarking shortcut opens. Each keeps the state in memory, so a write by
 *  one is invisible to the other until it is adopted - and an unadopted write is not merely
 *  unseen, it is overwritten by the next thing the other page saves.
 */
describe("AppStateRepository adopting a write made in another page", () => {

    const WORKSPACE = "0199aaaa-0000-7000-8000-00000000e001";
    const GROUP = "0199aaaa-0000-7000-8000-00000000g001";

    /** The new tab page: opened first, and left open. */
    let openPage: AppStateRepository;

    /** The bookmarking window: opened over the same storage a moment later. */
    let otherPage: AppStateRepository;

    let profileId: string;

    beforeEach(async () => {
        const profiles = new ProfileRepository();
        await profiles.init();
        profileId = profiles.getActiveProfileId();

        openPage = new AppStateRepository();
        await openPage.init(appStateInit, profileId);
        await openPage.replaceCurrentProfileData(profileOf({
            environments: [environment(WORKSPACE, "Work")],
            groups: [group(GROUP, "Reading", WORKSPACE)],
            activeEnvironmentId: WORKSPACE
        }));

        otherPage = new AppStateRepository();
        await otherPage.init(appStateInit, profileId);
    });

    it("shows a link the other page stored", async () => {
        await otherPage.createLink("https://example.com/", "Example", GROUP);
        await flushStorageNotifications();

        const links = Object.values(openPage.state$.get().links);
        expect(links.map(one => one.url)).toEqual(["https://example.com/"]);
    });

    it("keeps that link when it saves something of its own next", async () => {
        // The regression this exists for. Without adopting the write, the page that was
        // already open still holds a profile with no such link, and the very next save -
        // any save, this one is only the cheapest to write - puts that older picture back
        // over the stored one, and the bookmark is gone.
        await otherPage.createLink("https://example.com/", "Example", GROUP);
        await flushStorageNotifications();

        await openPage.createLink("https://another.example/", "Another", GROUP);

        const stored = readFakeStorage<AppState>(appStateKey(profileId))!;
        expect(Object.values(stored.links).map(one => one.url).sort())
            .toEqual(["https://another.example/", "https://example.com/"]);
    });

    it("ignores a write to a profile it does not hold", async () => {
        const before = openPage.state$.get();

        await openPage.saveProfileData("0199aaaa-0000-7000-8000-00000000p002", profileOf({
            environments: [environment("env-elsewhere", "Elsewhere")]
        }));
        await flushStorageNotifications();

        expect(openPage.state$.get()).toEqual(before);
    });
});

/**
 *  A subgroup's colour is the colour Chrome paints its tab group. It is given one when it is
 *  created rather than when it is first opened as tabs, because the heading is tinted with it
 *  straight away - and because two subgroups that came out the same colour are confusing in
 *  the tab strip long before anyone opens a menu to fix it.
 */
describe("AppStateRepository subgroup colours", () => {

    const ENV = "0199aaaa-0000-7000-8000-00000000e002";
    const GROUP = "0199aaaa-0000-7000-8000-00000000g002";

    let appState: AppStateRepository;

    beforeEach(async () => {
        const profiles = new ProfileRepository();
        await profiles.init();
        appState = new AppStateRepository();
        await appState.init(appStateInit, profiles.getActiveProfileId());
        await appState.replaceCurrentProfileData(profileOf({
            environments: [environment(ENV, "Work")],
            groups: [group(GROUP, "Reading", ENV)],
            activeEnvironmentId: ENV
        }));
    });

    const coloursOf = (state: { subgroups: Record<string, { color?: string }> }) =>
        Object.values(state.subgroups).map(subgroup => subgroup.color);

    it("gives a new subgroup a colour", () => {
        return appState.createSubGroup(GROUP, ENV, "Fresh").then(state => {
            expect(coloursOf(state)[0]).toBeTruthy();
        });
    });

    it("gives every subgroup of a profile a different colour, while it can", async () => {
        // Nine colours, nine subgroups: nobody should have to go and fix a duplicate by hand
        // before the palette is even used up.
        for (let i = 0; i < 9; i++) {
            await appState.createSubGroup(GROUP, ENV, `Subgroup ${i}`);
        }

        const colours = coloursOf(appState.state$.get());
        expect(colours).toHaveLength(9);
        expect(new Set(colours).size).toBe(9);
    });

    it("changes a subgroup's colour", async () => {
        const created = await appState.createSubGroup(GROUP, ENV, "Fresh");
        const id = Object.keys(created.subgroups)[0];

        const state = await appState.setSubgroupColor(id, "purple");

        expect(state.subgroups[id].color).toBe("purple");
    });

    it("does nothing for a subgroup that is not there", async () => {
        const before = appState.state$.get();

        const state = await appState.setSubgroupColor("sub-deleted-elsewhere", "red");

        expect(state.subgroups).toEqual(before.subgroups);
    });
});

/**
 *  What the link context menu asks before it offers a move. A menu that offered "move up" on
 *  the first link and then ignored the click would be lying about what it can do, and the only
 *  way a menu has of saying "nowhere to go" is to leave the item out.
 */
describe("AppStateRepository.canMoveWithinScope", () => {

    const ENV = "0199aaaa-0000-7000-8000-00000000e003";
    const GROUP = "0199aaaa-0000-7000-8000-00000000g003";

    let appState: AppStateRepository;

    beforeEach(async () => {
        const profiles = new ProfileRepository();
        await profiles.init();
        appState = new AppStateRepository();
        await appState.init(appStateInit, profiles.getActiveProfileId());
        await appState.replaceCurrentProfileData(profileOf({
            environments: [environment(ENV, "Work")],
            groups: [group(GROUP, "Reading", ENV)],
            subgroups: [subgroup("sub", "Later", GROUP, ENV, 1)],
            links: [
                link("first", "First", "https://one.test", GROUP, ENV, { position: 0 }),
                link("last", "Last", "https://two.test", GROUP, ENV, { position: 2 }),
                link("inside", "Inside", "https://three.test", GROUP, ENV,
                    { subGroupId: "sub", position: 0 })
            ],
            activeEnvironmentId: ENV
        }));
    });

    it("says the first item cannot go up", () => {
        expect(appState.canMoveWithinScope("first")).toEqual({ up: false, down: true });
    });

    it("says the last item cannot go down", () => {
        expect(appState.canMoveWithinScope("last")).toEqual({ up: true, down: false });
    });

    it("counts the subgroups a root-level link is ordered against", () => {
        // The subgroup sits between the two links, so "last" has something above it that is
        // not a link at all. A scope of links only would have called it the second of two.
        expect(appState.canMoveWithinScope("sub")).toEqual({ up: true, down: true });
    });

    it("says an only child can go nowhere", () => {
        // The one link inside the subgroup: its scope is that subgroup's own contents.
        expect(appState.canMoveWithinScope("inside")).toEqual({ up: false, down: false });
    });

    it("says nothing is possible for something that is not there", () => {
        expect(appState.canMoveWithinScope("deleted-elsewhere"))
            .toEqual({ up: false, down: false });
    });
});

/**
 *  Where a dragged link lands. The index a drop names counts the sequence as the user sees it,
 *  which still contains the link being dragged - so every move within one sequence has an
 *  off-by-one waiting in it, and the root-level sequence counts the subgroups between the
 *  links as well.
 */
describe("AppStateRepository.moveLinkTo", () => {

    const ENV = "0199aaaa-0000-7000-8000-00000000e004";
    const GROUP = "0199aaaa-0000-7000-8000-00000000g004";
    const OTHER_GROUP = "0199aaaa-0000-7000-8000-00000000g005";
    const SUB = "0199aaaa-0000-7000-8000-0000000000s01";

    let appState: AppStateRepository;

    beforeEach(async () => {
        const profiles = new ProfileRepository();
        await profiles.init();
        appState = new AppStateRepository();
        await appState.init(appStateInit, profiles.getActiveProfileId());
        await appState.replaceCurrentProfileData(profileOf({
            environments: [environment(ENV, "Work")],
            groups: [group(GROUP, "Reading", ENV), group(OTHER_GROUP, "Later", ENV, 1)],
            subgroups: [subgroup(SUB, "Archive", GROUP, ENV, 2)],
            links: [
                link("a", "A", "https://a.test", GROUP, ENV, { position: 0 }),
                link("b", "B", "https://b.test", GROUP, ENV, { position: 1 }),
                link("c", "C", "https://c.test", GROUP, ENV, { position: 3 }),
                link("inside", "Inside", "https://inside.test", GROUP, ENV,
                    { subGroupId: SUB, position: 0 })
            ],
            activeEnvironmentId: ENV
        }));
    });

    /** The root sequence of a group, in the order it is drawn. */
    const rootOf = (state: AppState, groupId: string) => [
        ...Object.values(state.links).filter(l => l.groupId === groupId && !l.subGroupId),
        ...Object.values(state.subgroups).filter(sg => sg.groupId === groupId)
    ].sort((one, other) => one.position - other.position).map(item => item.id);

    it("moves a link down its own sequence, landing where it was dropped", async () => {
        // [a, b, sub, c] - drop a after sub, which is index 3 in the list as drawn.
        const state = await appState.moveLinkTo("a", GROUP, undefined, 3);

        expect(rootOf(state, GROUP)).toEqual(["b", SUB, "a", "c"]);
    });

    it("moves a link up its own sequence", async () => {
        const state = await appState.moveLinkTo("c", GROUP, undefined, 1);

        expect(rootOf(state, GROUP)).toEqual(["a", "c", "b", SUB]);
    });

    it("leaves a link where it is when it is dropped back on itself", async () => {
        const state = await appState.moveLinkTo("b", GROUP, undefined, 1);

        expect(rootOf(state, GROUP)).toEqual(["a", "b", SUB, "c"]);
    });

    it("counts the subgroups between the links", async () => {
        // Index 2 is the subgroup's place, so a link dropped there goes before it - not
        // before the third *link*, which a sequence of links only would have said.
        const state = await appState.moveLinkTo("c", GROUP, undefined, 2);

        expect(rootOf(state, GROUP)).toEqual(["a", "b", "c", SUB]);
    });

    it("takes a link into a subgroup", async () => {
        const state = await appState.moveLinkTo("a", GROUP, SUB, 99);

        expect(state.links["a"].subGroupId).toBe(SUB);
        expect(rootOf(state, GROUP)).toEqual(["b", SUB, "c"]);
        expect(Object.values(state.links)
            .filter(l => l.subGroupId === SUB)
            .sort((one, other) => one.position - other.position)
            .map(l => l.id)).toEqual(["inside", "a"]);
    });

    it("takes a link out of a subgroup and into the group", async () => {
        const state = await appState.moveLinkTo("inside", GROUP, undefined, 0);

        expect(state.links["inside"].subGroupId).toBeUndefined();
        expect(rootOf(state, GROUP)).toEqual(["inside", "a", "b", SUB, "c"]);
    });

    it("takes a link into another group entirely", async () => {
        const state = await appState.moveLinkTo("a", OTHER_GROUP, undefined, 0);

        expect(state.links["a"].groupId).toBe(OTHER_GROUP);
        expect(rootOf(state, OTHER_GROUP)).toEqual(["a"]);
        // And closes the gap behind it.
        expect(rootOf(state, GROUP)).toEqual(["b", SUB, "c"]);
    });

    it("renumbers both sequences from zero", async () => {
        // Stored positions are not guaranteed to be a clean 0..n-1 - this fixture starts at
        // 0, 1, 3 - and arithmetic on a sequence that is not moves the wrong things.
        const state = await appState.moveLinkTo("a", SUB ? GROUP : GROUP, SUB, 0);

        const root = Object.values(state.links)
            .filter(l => l.groupId === GROUP && !l.subGroupId)
            .map(l => l.position)
            .concat(Object.values(state.subgroups).map(sg => sg.position))
            .sort((one, other) => one - other);
        expect(root).toEqual([0, 1, 2]);
    });

    it("refuses a subgroup that belongs to another group", async () => {
        const before = appState.state$.get();

        const state = await appState.moveLinkTo("a", OTHER_GROUP, SUB, 0);

        expect(state.links).toEqual(before.links);
    });

    it("does nothing for a link or a group that is not there", async () => {
        const before = appState.state$.get();

        await appState.moveLinkTo("gone", GROUP, undefined, 0);
        const state = await appState.moveLinkTo("a", "no-such-group", undefined, 0);

        expect(state.links).toEqual(before.links);
    });
});

/**
 *  Where a dragged group lands among its workspace's columns.
 */
describe("AppStateRepository.moveGroupTo", () => {

    const ENV = "0199aaaa-0000-7000-8000-00000000e005";

    let appState: AppStateRepository;

    beforeEach(async () => {
        const profiles = new ProfileRepository();
        await profiles.init();
        appState = new AppStateRepository();
        await appState.init(appStateInit, profiles.getActiveProfileId());
        await appState.replaceCurrentProfileData(profileOf({
            environments: [environment(ENV, "Work")],
            groups: [
                group("one", "One", ENV, 0),
                group("two", "Two", ENV, 1),
                group("three", "Three", ENV, 5)
            ],
            activeEnvironmentId: ENV
        }));
    });

    const order = () => appState.getGroups(ENV).map(group => group.id);

    it("moves a group to the right, landing where it was dropped", async () => {
        await appState.moveGroupTo("one", 2);

        expect(order()).toEqual(["two", "one", "three"]);
    });

    it("moves a group to the left", async () => {
        await appState.moveGroupTo("three", 0);

        expect(order()).toEqual(["three", "one", "two"]);
    });

    it("renumbers from zero, whatever the orders were", async () => {
        await appState.moveGroupTo("three", 0);

        expect(appState.getGroups(ENV).map(group => group.order)).toEqual([0, 1, 2]);
    });

    it("clamps an index past the end", async () => {
        await appState.moveGroupTo("one", 99);

        expect(order()).toEqual(["two", "three", "one"]);
    });
});

/**
 *  Where a dragged subgroup lands. It shares its sequence with the group's root-level links,
 *  and its own links travel with it - a link names the group it is in as well as the subgroup,
 *  so a subgroup that moved alone would leave its contents claiming a group that no longer
 *  holds them.
 */
describe("AppStateRepository.moveSubgroupTo", () => {

    const ENV = "0199aaaa-0000-7000-8000-00000000e006";
    const GROUP = "0199aaaa-0000-7000-8000-00000000g006";
    const OTHER = "0199aaaa-0000-7000-8000-00000000g007";
    const SUB = "0199aaaa-0000-7000-8000-0000000000s02";

    let appState: AppStateRepository;

    beforeEach(async () => {
        const profiles = new ProfileRepository();
        await profiles.init();
        appState = new AppStateRepository();
        await appState.init(appStateInit, profiles.getActiveProfileId());
        await appState.replaceCurrentProfileData(profileOf({
            environments: [environment(ENV, "Work")],
            groups: [group(GROUP, "Reading", ENV), group(OTHER, "Later", ENV, 1)],
            subgroups: [subgroup(SUB, "Archive", GROUP, ENV, 1)],
            links: [
                link("a", "A", "https://a.test", GROUP, ENV, { position: 0 }),
                link("b", "B", "https://b.test", GROUP, ENV, { position: 2 }),
                link("inside", "Inside", "https://inside.test", GROUP, ENV,
                    { subGroupId: SUB, position: 0 })
            ],
            activeEnvironmentId: ENV
        }));
    });

    const rootOf = (state: AppState, groupId: string) => [
        ...Object.values(state.links).filter(l => l.groupId === groupId && !l.subGroupId),
        ...Object.values(state.subgroups).filter(sg => sg.groupId === groupId)
    ].sort((one, other) => one.position - other.position).map(item => item.id);

    it("moves a subgroup up its group's sequence, past a link", async () => {
        // [a, sub, b] - dropped at the top.
        const state = await appState.moveSubgroupTo(SUB, GROUP, 0);

        expect(rootOf(state, GROUP)).toEqual([SUB, "a", "b"]);
    });

    it("moves a subgroup down its group's sequence", async () => {
        const state = await appState.moveSubgroupTo(SUB, GROUP, 3);

        expect(rootOf(state, GROUP)).toEqual(["a", "b", SUB]);
    });

    it("takes a subgroup into another group", async () => {
        const state = await appState.moveSubgroupTo(SUB, OTHER, 0);

        expect(state.subgroups[SUB].groupId).toBe(OTHER);
        expect(rootOf(state, OTHER)).toEqual([SUB]);
        expect(rootOf(state, GROUP)).toEqual(["a", "b"]);
    });

    it("takes the subgroup's links with it", async () => {
        // A link names its group as well as its subgroup. One left behind would claim a group
        // that no longer holds its subgroup, and be drawn by neither.
        const state = await appState.moveSubgroupTo(SUB, OTHER, 0);

        expect(state.links["inside"].groupId).toBe(OTHER);
        expect(state.links["inside"].subGroupId).toBe(SUB);
    });

    it("leaves the order inside the subgroup alone", async () => {
        const state = await appState.moveSubgroupTo(SUB, OTHER, 0);

        expect(state.links["inside"].position).toBe(0);
    });

    it("renumbers both sequences from zero", async () => {
        const state = await appState.moveSubgroupTo(SUB, OTHER, 0);

        expect(Object.values(state.links)
            .filter(l => l.groupId === GROUP && !l.subGroupId)
            .map(l => l.position)
            .sort()).toEqual([0, 1]);
    });

    it("does nothing for a subgroup or a group that is not there", async () => {
        const before = appState.state$.get();

        await appState.moveSubgroupTo("gone", GROUP, 0);
        const state = await appState.moveSubgroupTo(SUB, "no-such-group", 0);

        expect(state.subgroups).toEqual(before.subgroups);
    });
});

/**
 *  Making a link where something was dropped that was not a link yet - a closed tab dragged
 *  out of the panel. It is made and then moved, so it lands under exactly the rules an
 *  existing link would.
 */
describe("AppStateRepository.createLinkAt", () => {

    const ENV = "0199aaaa-0000-7000-8000-00000000e007";
    const GROUP = "0199aaaa-0000-7000-8000-00000000g008";
    const SUB = "0199aaaa-0000-7000-8000-0000000000s03";

    let appState: AppStateRepository;

    beforeEach(async () => {
        const profiles = new ProfileRepository();
        await profiles.init();
        appState = new AppStateRepository();
        await appState.init(appStateInit, profiles.getActiveProfileId());
        await appState.replaceCurrentProfileData(profileOf({
            environments: [environment(ENV, "Work")],
            groups: [group(GROUP, "Reading", ENV)],
            subgroups: [subgroup(SUB, "Archive", GROUP, ENV, 1)],
            links: [
                link("a", "A", "https://a.test", GROUP, ENV, { position: 0 }),
                link("b", "B", "https://b.test", GROUP, ENV, { position: 2 })
            ],
            activeEnvironmentId: ENV
        }));
    });

    const rootOf = (state: AppState) => [
        ...Object.values(state.links).filter(l => l.groupId === GROUP && !l.subGroupId),
        ...Object.values(state.subgroups)
    ].sort((one, other) => one.position - other.position)
        .map(item => "url" in item ? item.url : item.id);

    it("puts the new link where it was dropped", async () => {
        const state = await appState.createLinkAt(
            "https://new.test", "New", GROUP, undefined, 1);

        expect(rootOf(state)).toEqual(["https://a.test", "https://new.test", SUB, "https://b.test"]);
    });

    it("puts it at the top when that is where it was dropped", async () => {
        const state = await appState.createLinkAt(
            "https://new.test", "New", GROUP, undefined, 0);

        expect(rootOf(state)[0]).toBe("https://new.test");
    });

    it("puts it at the end for an index past it", async () => {
        const state = await appState.createLinkAt(
            "https://new.test", "New", GROUP, undefined, 99);

        expect(rootOf(state).slice(-1)[0]).toBe("https://new.test");
    });

    it("makes it inside a subgroup when that is where it was dropped", async () => {
        const state = await appState.createLinkAt(
            "https://new.test", "New", GROUP, SUB, 0);

        const made = Object.values(state.links).find(l => l.url === "https://new.test")!;
        expect(made.subGroupId).toBe(SUB);
        expect(made.groupId).toBe(GROUP);
    });

    it("leaves the sequence numbered from zero", async () => {
        const state = await appState.createLinkAt(
            "https://new.test", "New", GROUP, undefined, 1);

        const positions = [
            ...Object.values(state.links).filter(l => l.groupId === GROUP && !l.subGroupId),
            ...Object.values(state.subgroups)
        ].map(item => item.position).sort((one, other) => one - other);
        expect(positions).toEqual([0, 1, 2, 3]);
    });
});
