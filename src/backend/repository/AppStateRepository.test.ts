import { beforeEach, describe, expect, it } from "vitest";

import { AppStateRepository } from "./AppStateRepository";
import { ProfileRepository } from "./ProfileRepository";
import { appStateInit } from "../datasource/init/AppStateInit";
import { environment, profileOf } from "../../test/profileDataFixtures";

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
