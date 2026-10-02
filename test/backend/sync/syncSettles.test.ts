import { beforeEach, describe, expect, it } from "vitest";

import { AppStateRepository } from "../../../src/backend/repository/AppStateRepository";
import { ProfileRepository } from "../../../src/backend/repository/ProfileRepository";
import { recordClosedTab } from "../../../src/backend/repository/ClosedTabsRepository";
import { stateWithLinks } from "../../support/profileDataFixtures";
import { ApiResult } from "../../../src/backend/sync/BackendApiClient";
import { installationIdentity } from "../../../src/backend/sync/InstallationIdentity";
import { SessionRepository } from "../../../src/backend/sync/SessionRepository";
import { SyncBaselineRepository } from "../../../src/backend/sync/SyncBaselineRepository";
import { SyncCoordinator } from "../../../src/backend/sync/SyncCoordinator";
import { SyncOperation, SyncPushResult, SyncSnapshot } from "../../../src/backend/sync/SyncContracts";
import { FakeAccount } from "../../support/fakeAccount";

/**
 *  **Does synchronising ever finish?**
 *
 *  Every other test here asks whether one change reaches the account. This one asks the
 *  question underneath all of them: once a device has pushed and pulled, does it still believe
 *  it has something to say? If it does, it will say it again on the next trigger and for ever
 *  after - and because every push draws a change notification, a second connected browser will
 *  pull, compute the same difference from its own side, push, and notify back. Two devices
 *  then talk to each other as fast as the network allows while nothing at all changes.
 *
 *  That happened, and none of the existing tests could have caught it: they assert what one
 *  synchronisation sends, and the fault is in what the *second* one sends. The account here
 *  applies what it is pushed and serves it back, so a field that does not survive the round
 *  trip shows up as an operation that will not go away.
 */
describe("synchronisation settles", () => {

    let appState: AppStateRepository;
    let profiles: ProfileRepository;
    let sessions: SessionRepository;
    let baselines: SyncBaselineRepository;
    let account: FakeAccount;
    let pushes: SyncOperation[][];

    beforeEach(async () => {
        await installationIdentity.init();

        profiles = new ProfileRepository();
        await profiles.init();

        appState = new AppStateRepository();
        // A device with links of its own: workspaces, groups, subgroups, links.
        await appState.init(stateWithLinks(), profiles.getActiveProfileId());

        sessions = new SessionRepository();
        await sessions.init();
        await sessions.storeTokenPair({
            accessToken: "access", accessTokenExpiresInSeconds: 900, refreshToken: "refresh",
            userId: "owner", username: "kovo"
        });

        baselines = new SyncBaselineRepository();
        await baselines.init();

        account = new FakeAccount();
        pushes = [];
    });

    /** A coordinator talking to the fake account. */
    function coordinator(): SyncCoordinator {
        const apiClient = {
            fetchSnapshot: () => Promise.resolve(
                { outcome: "success", data: account.snapshot() } as ApiResult<SyncSnapshot>),
            pushChanges: (request: { operations: SyncOperation[] }) => {
                pushes.push(request.operations);
                account.apply(request.operations);
                return Promise.resolve({
                    outcome: "success",
                    data: { appliedAt: "2026-01-01T00:00:00Z", remaps: [], rejected: [] }
                } as ApiResult<SyncPushResult>);
            }
        };
        return new SyncCoordinator(
            appState, profiles, sessions, baselines, apiClient as never);
    }

    /** What the second synchronisation has to say, which should be nothing. */
    async function operationsOfTheSecondPass(): Promise<SyncOperation[]> {
        const coordinating = coordinator();
        await coordinating.synchronizeNow();
        pushes = [];
        await coordinating.synchronizeNow();
        return pushes.flat();
    }

    it("has nothing to say the second time, for the data a fresh install starts with", async () => {
        expect(await operationsOfTheSecondPass()).toEqual([]);
    });

    it("has nothing to say the second time, with closed tabs in the account", async () => {
        await recordClosedTab(profiles.getActiveProfileId(), {
            url: "https://example.com/one", title: "One", closedAt: 1_700_000_000_000,
            deviceName: "Laptop"
        });
        await recordClosedTab(profiles.getActiveProfileId(), {
            url: "https://example.com/two", title: "", closedAt: 1_700_000_001_000
        });

        expect(await operationsOfTheSecondPass()).toEqual([]);
    });

    it("has nothing to say the second time, with a coloured subgroup that catches links",
        async () => {
            const workspace = appState.getCurrentEnvironmentId()!;
            const group = appState.getGroups(workspace)[0];
            const state = await appState.createSubGroup(group.id, workspace, "Reading", "Later");
            const created = Object.values(state.subgroups)
                .find(subgroup => subgroup.title === "Reading")!;
            await appState.setSubgroupColor(created.id, "purple");
            await appState.toggleSubgroupCatchLinksIntoTabGroup(created.id);

            expect(await operationsOfTheSecondPass()).toEqual([]);
        });

    it("has nothing to say the second time, with the profile's settings turned on", async () => {
        await profiles.updateSettings({ enableDragAndDrop: true, hideTips: true });

        expect(await operationsOfTheSecondPass()).toEqual([]);
    });

    it("has nothing to say about closed tabs the account holds twice over", async () => {
        // Two browsers close the same page, so the account holds two rows for one address -
        // it cannot refuse them, a unique constraint there would make a legitimate push fail.
        // Whatever this device makes of that, it must not be something it has to say again on
        // every synchronisation for the rest of the day.
        const profileId = profiles.getActiveProfileId();
        account.apply([
            {
                op: "upsert", type: "closedTab", id: "from-laptop", profileId,
                url: "https://example.com/page", title: "Page",
                closedAt: "2026-01-01T10:00:00Z"
            },
            {
                op: "upsert", type: "closedTab", id: "from-desktop", profileId,
                url: "https://example.com/page", title: "Page",
                closedAt: "2026-01-01T11:00:00Z"
            }
        ]);

        expect(await operationsOfTheSecondPass()).toEqual([]);
    });

    it("has nothing to say about more closed tabs than it keeps", async () => {
        // Two devices filling the list mean the account can hold more than this one keeps.
        const profileId = profiles.getActiveProfileId();
        account.apply(Array.from({ length: 60 }, (_, index) => ({
            op: "upsert" as const, type: "closedTab" as const, id: `tab-${index}`, profileId,
            url: `https://example.com/${index}`, title: `Page ${index}`,
            closedAt: new Date(1_700_000_000_000 + index * 1000).toISOString()
        })));

        expect(await operationsOfTheSecondPass()).toEqual([]);
    });

    it("has nothing to say the third time either", async () => {
        // A difference that alternates rather than repeats would settle in the second pass and
        // come back in the third.
        const coordinating = coordinator();
        await coordinating.synchronizeNow();
        await coordinating.synchronizeNow();
        pushes = [];
        await coordinating.synchronizeNow();

        expect(pushes.flat()).toEqual([]);
    });
});
