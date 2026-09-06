import { beforeEach, describe, expect, it } from "vitest";

import { AppStateRepository } from "./AppStateRepository";
import { ProfileRepository } from "./ProfileRepository";
import { appStateInit } from "../datasource/init/AppStateInit";
import { environment, group, link, profileOf, subgroup } from "../../test/profileDataFixtures";

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
