import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppStateRepository } from "../repository/AppStateRepository";
import { ProfileRepository } from "../repository/ProfileRepository";
import { appStateInit } from "../datasource/init/AppStateInit";

import { ApiResult } from "./BackendApiClient";
import { installationIdentity } from "./InstallationIdentity";
import { SessionRepository } from "./SessionRepository";
import { SyncBaselineRepository } from "./SyncBaselineRepository";
import { SyncCoordinator } from "./SyncCoordinator";
import { SnapshotProfileDto, SyncOperation, SyncPushResult, SyncSnapshot } from "./SyncContracts";

const REAL_PROFILE = "0199aaaa-0000-7000-8000-00000000000a";
const PHANTOM_PROFILE = "0199bbbb-0000-7000-8000-00000000000b";
const REAL_ENVIRONMENT = "0199cccc-0000-7000-8000-00000000000c";
const REAL_GROUP = "0199dddd-0000-7000-8000-00000000000d";
const REAL_LINK = "0199eeee-0000-7000-8000-00000000000e";

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
        await appState.init(appStateInit, profiles.getActiveProfileId());

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
});
