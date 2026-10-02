import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppStateRepository } from "../../../src/backend/repository/AppStateRepository";
import { ProfileRepository } from "../../../src/backend/repository/ProfileRepository";
import { stateWithLinks } from "../../support/profileDataFixtures";

import { ApiResult } from "../../../src/backend/sync/BackendApiClient";
import { installationIdentity } from "../../../src/backend/sync/InstallationIdentity";
import { SessionRepository } from "../../../src/backend/sync/SessionRepository";
import { SyncBaselineRepository } from "../../../src/backend/sync/SyncBaselineRepository";
import { SyncCoordinator } from "../../../src/backend/sync/SyncCoordinator";
import { readClosedTabs, recordClosedTab } from "../../../src/backend/repository/ClosedTabsRepository";
import { SnapshotProfileDto, SyncOperation, SyncPushResult, SyncSnapshot } from "../../../src/backend/sync/SyncContracts";

const REAL_PROFILE = "0199aaaa-0000-7000-8000-00000000000a";
const PHANTOM_PROFILE = "0199bbbb-0000-7000-8000-00000000000b";
const REAL_ENVIRONMENT = "0199cccc-0000-7000-8000-00000000000c";
const REAL_GROUP = "0199dddd-0000-7000-8000-00000000000d";
const REAL_LINK = "0199eeee-0000-7000-8000-00000000000e";

/** A profile the account has and this device has never held, under a name of its own. */
const REMOTE_ONLY_PROFILE = "0199ffff-0000-7000-8000-00000000000f";
const REMOTE_ONLY_ENVIRONMENT = "01991111-0000-7000-8000-000000000011";
const REMOTE_ONLY_GROUP = "01992222-0000-7000-8000-000000000022";

const NOW = "2026-01-01T00:00:00Z";

function profileDto(id: string, name: string, position: number): SnapshotProfileDto {
    return { id, ownerId: "owner", name, position, createdAt: NOW, updatedAt: NOW };
}

/**
 *  An account holding one real profile full of links and, after it, empty profiles of the same
 *  name - which is the state the phantom bug left every account in.
 */
function accountWith(...alsoNamedDefault: string[]): SyncSnapshot {
    return {
        owner: { id: "owner", username: "kovo" },
        profiles: [
            profileDto(REAL_PROFILE, "Default", 0),
            ...alsoNamedDefault.map((id, index) => profileDto(id, "Default", index + 1))
        ],
        environments: [{
            id: REAL_ENVIRONMENT, ownerId: "owner", profileId: REAL_PROFILE, name: "Default",
            description: null, position: 0, createdAt: NOW, updatedAt: NOW
        }],
        groups: [{
            id: REAL_GROUP, environmentId: REAL_ENVIRONMENT, name: "Work",
            description: null, position: 0, createdAt: NOW, updatedAt: NOW
        }],
        subgroups: [],
        links: [{
            id: REAL_LINK, parentGroupId: REAL_GROUP, parentSubgroupId: null,
            title: "The user's link", url: "https://precious.test", faviconUrl: null,
            position: 0, createdAt: NOW, updatedAt: NOW
        }],
        capturedAt: NOW
    };
}

/**
 *  An account holding, besides the profile this device pairs with by name, a second profile
 *  under a name of its own that has workspaces in it. That one is never paired, so it takes
 *  the "carry it down as it stands" path rather than the merge.
 */
function accountWithAProfileThisDeviceHasNeverHad(): SyncSnapshot {
    const snapshot = accountWith();
    snapshot.profiles.push(profileDto(REMOTE_ONLY_PROFILE, "Work", 1));
    snapshot.environments.push({
        id: REMOTE_ONLY_ENVIRONMENT, ownerId: "owner", profileId: REMOTE_ONLY_PROFILE,
        name: "Clients", description: null, position: 0, createdAt: NOW, updatedAt: NOW
    });
    snapshot.groups.push({
        id: REMOTE_ONLY_GROUP, environmentId: REMOTE_ONLY_ENVIRONMENT, name: "Invoices",
        description: null, position: 0, createdAt: NOW, updatedAt: NOW
    });
    return snapshot;
}

describe("SyncCoordinator, first contact with an account", () => {

    let appState: AppStateRepository;
    let profiles: ProfileRepository;
    let sessions: SessionRepository;
    let baselines: SyncBaselineRepository;
    let pushed: SyncOperation[][];
    let apiClient: {
        fetchSnapshot: () => Promise<ApiResult<SyncSnapshot>>;
        pushChanges: (request: { operations: SyncOperation[] }) => Promise<ApiResult<SyncPushResult>>;
    };

    /**
     *  A coordinator whose account can be read exactly once.
     *
     *  synchronizeNow() pushes and then pulls, and a pull writes the account's state over
     *  everything the merge just did - so a test that let it run would be asserting on a
     *  snapshot rather than on the merge, and would pass however badly the merge behaved. The
     *  second read fails instead, which is an ordinary thing for a browser extension to hit
     *  and leaves the merge's own result standing to be looked at.
     */
    async function coordinatorFor(snapshot: SyncSnapshot): Promise<SyncCoordinator> {
        let accountRead = false;
        apiClient.fetchSnapshot = () => {
            if (accountRead) {
                return Promise.resolve(
                    { outcome: "offline", message: "one read only" } as ApiResult<SyncSnapshot>);
            }
            accountRead = true;
            return Promise.resolve(
                { outcome: "success", data: snapshot } as ApiResult<SyncSnapshot>);
        };

        return new SyncCoordinator(appState, profiles, sessions, baselines, apiClient as never);
    }

    beforeEach(async () => {
        await installationIdentity.init();

        profiles = new ProfileRepository();
        await profiles.init();

        appState = new AppStateRepository();
        // The seed data every fresh install starts with: "Work", "Personal", test links.
        await appState.init(stateWithLinks(), profiles.getActiveProfileId());

        sessions = new SessionRepository();
        await sessions.init();
        await sessions.storeTokenPair({
            accessToken: "access", accessTokenExpiresInSeconds: 900, refreshToken: "refresh",
            userId: "owner", username: "kovo"
        });

        baselines = new SyncBaselineRepository();
        await baselines.init();

        pushed = [];
        apiClient = {
            fetchSnapshot: () => Promise.reject(new Error("stub not set")),
            pushChanges: request => {
                pushed.push(request.operations);
                return Promise.resolve({
                    outcome: "success",
                    data: { appliedAt: NOW, remaps: [], rejected: [] }
                } as ApiResult<SyncPushResult>);
            }
        };
    });

    it("never asks the account to delete a profile when it has only just met it", async () => {
        // The data loss. The account holds several profiles called "Default" - one real, the
        // rest empty phantoms - and this device pairs its own by name. Keying them into a Map
        // let the later ones overwrite the earlier, so the real profile was neither merged into
        // nor copied down, while the baseline still listed it. A baseline record with no local
        // counterpart is exactly what the change set sends as a deletion.
        const coordinator = await coordinatorFor(accountWith(PHANTOM_PROFILE));

        await coordinator.synchronizeNow();

        const deletions = pushed.flat().filter(operation => operation.op === "delete");
        expect(deletions).toEqual([]);
    });

    it("keeps every profile the account holds, however many share a name", async () => {
        const coordinator = await coordinatorFor(accountWith(PHANTOM_PROFILE));

        await coordinator.synchronizeNow();

        expect(profiles.getProfiles().map(profile => profile.id).sort())
            .toEqual([REAL_PROFILE, PHANTOM_PROFILE].sort());
    });

    it("keeps the account's links when this device brought its own", async () => {
        const coordinator = await coordinatorFor(accountWith(PHANTOM_PROFILE));

        await coordinator.synchronizeNow();

        const stored = await appState.readProfileData(REAL_PROFILE);
        expect(Object.keys(stored?.links ?? {})).toContain(REAL_LINK);
    });

    it("still pairs correctly when no name is duplicated", async () => {
        const coordinator = await coordinatorFor(accountWith());

        await coordinator.synchronizeNow();

        expect(profiles.getProfiles().map(profile => profile.id)).toEqual([REAL_PROFILE]);
        const stored = await appState.readProfileData(REAL_PROFILE);
        expect(Object.keys(stored?.links ?? {})).toContain(REAL_LINK);
    });

    it("sends this device's own links up rather than dropping them", async () => {
        const coordinator = await coordinatorFor(accountWith());

        await coordinator.synchronizeNow();

        const created = pushed.flat().filter(operation => operation.op === "upsert");
        expect(created.some(operation => operation.type === "link")).toBe(true);
    });

    it("carries a profile down that this device has never had", async () => {
        const coordinator = await coordinatorFor(accountWith(PHANTOM_PROFILE));

        await coordinator.synchronizeNow();

        const carried = await appState.readProfileData(PHANTOM_PROFILE);
        expect(carried).not.toBeNull();
    });

    it("opens a workspace in a profile carried down that this device has never had", async () => {
        // A mapped snapshot names no open workspace - that is per-device and never
        // synchronised - so a profile carried down whole arrived holding workspaces while
        // naming none. Stored that way it reports itself as having no workspace at all, which
        // sends the page to the first-run screen; the reload guard on that screen then
        // reloaded it several times a second for as long as the tab was open.
        const coordinator = await coordinatorFor(accountWithAProfileThisDeviceHasNeverHad());

        await coordinator.synchronizeNow();

        const carried = await appState.readProfileData(REMOTE_ONLY_PROFILE);
        expect(Object.keys(carried?.environments ?? {})).toContain(REMOTE_ONLY_ENVIRONMENT);
        expect(carried?.activeEnvironmentId).toBe(REMOTE_ONLY_ENVIRONMENT);
    });

    it("leaves a carried profile with no workspaces naming none", async () => {
        // The empty case must stay empty rather than being given something to point at.
        const coordinator = await coordinatorFor(accountWith(PHANTOM_PROFILE));

        await coordinator.synchronizeNow();

        expect((await appState.readProfileData(PHANTOM_PROFILE))?.activeEnvironmentId).toBeNull();
    });

    /**
     *  Signing out clears the baseline and keeps the data, so a device that comes back holds
     *  the account's own identifiers and takes the first-contact path again. A profile
     *  renamed on the other device in the meantime then paired by nothing: the account's copy
     *  was carried down whole over this device's, and whatever this device alone had in that
     *  profile went with it.
     */
    describe("a profile renamed on another device", () => {

        const LOCAL_ONLY_LINK = "01993333-0000-7000-8000-000000000033";
        const SEEDED_PROFILE = "01994444-0000-7000-8000-000000000044";

        /** Drops everything this device came with, so a registry can be built deliberately. */
        async function forgetEverythingLocal(): Promise<void> {
            for (const existing of profiles.getProfiles()) {
                await profiles.removeProfile(existing.id);
                await appState.discardProfileData(existing.id);
            }
        }

        /** REAL_PROFILE under the name it had before the other device renamed it, with a
         *  link of its own in it. Appended to whatever the registry already holds. */
        async function holdRenamedProfile(): Promise<void> {
            await profiles.upsertProfile(
                { id: REAL_PROFILE, name: "Old name", createdAt: 0 });
            await profiles.setActiveProfile(REAL_PROFILE);
            await appState.saveProfileData(REAL_PROFILE, {
                environments: {
                    [REAL_ENVIRONMENT]: {
                        id: REAL_ENVIRONMENT, name: "Default", createdAt: 0, order: 0
                    }
                },
                groups: {
                    [REAL_GROUP]: {
                        id: REAL_GROUP, title: "Work", environmentId: REAL_ENVIRONMENT,
                        createdAt: 0, order: 0
                    }
                },
                subgroups: {},
                links: {
                    [LOCAL_ONLY_LINK]: {
                        id: LOCAL_ONLY_LINK, title: "Added while signed out",
                        url: "https://offline.test", environmentId: REAL_ENVIRONMENT,
                        groupId: REAL_GROUP, type: "link", position: 1, createdAt: 0
                    }
                },
                activeEnvironmentId: REAL_ENVIRONMENT
            });
            await appState.switchProfile(REAL_PROFILE);
        }

        it("keeps what this device added to it while it was signed out", async () => {
            // The data loss. Nothing paired the two copies of this profile, so the account's
            // was carried down whole over this device's, and the link made offline was gone
            // before the difference that would have pushed it was ever computed.
            await forgetEverythingLocal();
            await holdRenamedProfile();
            const coordinator = await coordinatorFor(accountWith());

            await coordinator.synchronizeNow();

            const stored = await appState.readProfileData(REAL_PROFILE);
            expect(Object.keys(stored?.links ?? {}).sort())
                .toEqual([REAL_LINK, LOCAL_ONLY_LINK].sort());
        });

        it("is not stolen by another local profile that happens to match by name", async () => {
            // Why identity is settled for every profile at once rather than inside the loop.
            // This device also has its seeded "Default", and the account's profile is now
            // called "Default" too. Pairing one profile at a time leaves the outcome to the
            // order the registry hands them over: the seeded one is considered first, takes
            // the account's profile by name, and the profile that actually *is* that profile
            // is left with nothing to pair with and its own identifier already spoken for.
            await forgetEverythingLocal();
            // The seeded profile is registered first, so it is the one a loop that pairs as
            // it goes reaches first - which is the whole point of the case.
            await profiles.upsertProfile(
                { id: SEEDED_PROFILE, name: "Default", createdAt: 0 });
            await holdRenamedProfile();
            const coordinator = await coordinatorFor(accountWith());

            await coordinator.synchronizeNow();

            const stored = await appState.readProfileData(REAL_PROFILE);
            expect(Object.keys(stored?.links ?? {})).toContain(LOCAL_ONLY_LINK);
            expect(Object.keys(stored?.links ?? {})).toContain(REAL_LINK);
        });
    });
});

/**
 *  What happens when the account is older than this extension.
 *
 *  A snapshot that names no closed tabs at all is not an account with none - it is a backend
 *  that has never heard of them. The difference is the whole of this bug: a record kind the
 *  server has no vocabulary for cannot be refused one operation at a time, it refuses the
 *  request it arrived in, so every push failed and every change on the device stayed there.
 *  With a second browser connected the two spent the rest of the day telling each other about
 *  it.
 */
describe("SyncCoordinator against an account that does not keep closed tabs", () => {

    let appState: AppStateRepository;
    let profiles: ProfileRepository;
    let sessions: SessionRepository;
    let baselines: SyncBaselineRepository;
    let apiClient: { fetchSnapshot: () => unknown; pushChanges: (r: never) => unknown };
    let pushed: SyncOperation[][];

    beforeEach(async () => {
        await installationIdentity.init();

        profiles = new ProfileRepository();
        await profiles.init();

        appState = new AppStateRepository();
        await appState.init(stateWithLinks(), profiles.getActiveProfileId());

        sessions = new SessionRepository();
        await sessions.init();
        await sessions.storeTokenPair({
            accessToken: "access", accessTokenExpiresInSeconds: 900, refreshToken: "refresh",
            userId: "owner", username: "kovo"
        });

        baselines = new SyncBaselineRepository();
        await baselines.init();

        await recordClosedTab(profiles.getActiveProfileId(), {
            url: "https://example.com/closed", title: "Closed here", closedAt: 1000
        });

        pushed = [];
        apiClient = {
            fetchSnapshot: () => Promise.resolve({ outcome: "success", data: accountWith() }),
            pushChanges: (request: never) => {
                pushed.push((request as { operations: SyncOperation[] }).operations);
                return Promise.resolve({
                    outcome: "success",
                    data: { appliedAt: NOW, remaps: [], rejected: [] }
                });
            }
        };
    });

    const coordinator = () =>
        new SyncCoordinator(appState, profiles, sessions, baselines, apiClient as never);

    it("sends it nothing about closed tabs", async () => {
        await coordinator().synchronizeNow();

        expect(pushed.flat().filter(operation => operation.type === "closedTab")).toEqual([]);
    });

    it("still sends it everything else", async () => {
        // The damage was never limited to closed tabs: one operation the server cannot parse
        // takes the whole batch with it, so this is the assertion that says the rest got out.
        await coordinator().synchronizeNow();

        expect(pushed.flat().length).toBeGreaterThan(0);
    });

    it("does not empty this device's own list", async () => {
        // A pull writes what the account holds over what the device holds. Told nothing, it
        // wrote nothing over them - and the panel emptied itself every time the extension
        // synchronised.
        await coordinator().synchronizeNow();

        const kept = await readClosedTabs(profiles.getActiveProfileId());
        expect(Object.values(kept).map(tab => tab.url)).toEqual(["https://example.com/closed"]);
    });
});
