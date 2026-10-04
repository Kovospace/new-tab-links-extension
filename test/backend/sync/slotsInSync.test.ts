import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AppStateRepository } from "../../../src/backend/repository/AppStateRepository";
import { ProfileRepository } from "../../../src/backend/repository/ProfileRepository";
import { appStateInit, buildExampleProfileData } from "../../../src/backend/datasource/init/AppStateInit";
import { markedAsExample } from "../../../src/backend/entity/ExampleData";
import { ApiResult } from "../../../src/backend/sync/BackendApiClient";
import { installationIdentity } from "../../../src/backend/sync/InstallationIdentity";
import { SessionRepository } from "../../../src/backend/sync/SessionRepository";
import { SyncBaselineRepository } from "../../../src/backend/sync/SyncBaselineRepository";
import { SyncCoordinator } from "../../../src/backend/sync/SyncCoordinator";
import { SyncOperation, SyncPushResult, SyncSnapshot } from "../../../src/backend/sync/SyncContracts";
import { FakeAccount } from "../../support/fakeAccount";
import { setStanding } from "../../support/standing";
import { environment, group, link, profileOf } from "../../support/profileDataFixtures";

const NOW = "2026-01-01T00:00:00Z";

/**
 *  Slots, end to end: a device on the free plan against an account that applies what it is
 *  pushed. Nothing over a limit is ever deleted from the device, nothing outside the slots is
 *  ever sent, and the pull never takes away what is local only.
 */
describe("synchronising within the slots", () => {

    let appState: AppStateRepository;
    let profiles: ProfileRepository;
    let sessions: SessionRepository;
    let baselines: SyncBaselineRepository;
    let account: FakeAccount;
    let pushes: SyncOperation[][];
    /** Runs before a push is applied; returns a refusal to send back instead. */
    let beforePush: (() => ApiResult<SyncPushResult> | null) | null;

    beforeEach(async () => {
        await installationIdentity.init();
        profiles = new ProfileRepository();
        await profiles.init();
        appState = new AppStateRepository();
        await appState.init(appStateInit, profiles.getActiveProfileId());
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
        beforePush = null;
        setStanding(false);
    });

    afterEach(() => setStanding(false));

    function coordinator(): SyncCoordinator {
        const apiClient = {
            ...account.listEndpoints(),
            fetchSnapshot: () => Promise.resolve({ outcome: "success", data: account.snapshot() } as ApiResult<SyncSnapshot>),
            pushChanges: (request: { operations: SyncOperation[] }) => {
                pushes.push(request.operations);
                const refusal = beforePush?.() ?? null;
                if (refusal) {
                    return Promise.resolve(refusal);
                }
                account.apply(request.operations);
                return Promise.resolve({
                    outcome: "success", data: { appliedAt: NOW, remaps: [], rejected: [] }
                } as ApiResult<SyncPushResult>);
            }
        };
        return new SyncCoordinator(appState, profiles, sessions, baselines, apiClient as never);
    }

    /** Three workspaces in the open profile - made while premium, or before any limit. */
    async function threeWorkspaces(): Promise<void> {
        await appState.replaceCurrentProfileData(profileOf({
            environments: [
                { ...environment("a0000000-0000-7000-8000-00000000000a", "A", 0), createdAt: 1 },
                { ...environment("b0000000-0000-7000-8000-00000000000b", "B", 1), createdAt: 2 },
                { ...environment("c0000000-0000-7000-8000-00000000000c", "C", 2), createdAt: 3 }
            ],
            groups: [group("c1000000-0000-7000-8000-00000000000c", "Kept", "c0000000-0000-7000-8000-00000000000c")],
            activeEnvironmentId: "a0000000-0000-7000-8000-00000000000a"
        }));
    }

    const accountWorkspaceNames = () => account.snapshot().environments.map(environment => environment.name).sort();
    const localWorkspaceNames = () => appState.getWorkspaces().map(workspace => workspace.name).sort();

    it("sends only what fits the free plan, keeps the rest, and then has nothing to say", async () => {
        await threeWorkspaces();
        const coordinating = coordinator();

        await coordinating.synchronizeNow();

        expect(accountWorkspaceNames()).toEqual(["A", "B"]);
        expect(localWorkspaceNames()).toEqual(["A", "B", "C"]);
        expect(appState.state$.get().groups["c1000000-0000-7000-8000-00000000000c"]).toBeDefined();
        expect(coordinating.scope$.get()?.workspaces["c0000000-0000-7000-8000-00000000000c"].state)
            .toBe("LOCAL_ONLY_FREE_LIMIT");

        pushes = [];
        await coordinating.synchronizeNow();
        expect(pushes).toEqual([]);
    });

    it("stops writing what lost its slot when premium ends, and resumes after an upgrade", async () => {
        setStanding(true);
        await threeWorkspaces();
        const coordinating = coordinator();
        await coordinating.synchronizeNow();
        expect(accountWorkspaceNames()).toEqual(["A", "B", "C"]);

        // Premium ends. The newest workspace on the account holds no slot any more: edited
        // here, it stays edited here and the account keeps its last copy.
        setStanding(false);
        await appState.renameWorkspace("c0000000-0000-7000-8000-00000000000c", "C edited", undefined);
        await coordinating.synchronizeNow();

        expect(accountWorkspaceNames()).toEqual(["A", "B", "C"]);
        expect(localWorkspaceNames()).toEqual(["A", "B", "C edited"]);

        // Upgraded again: it synchronises on its own, carrying what was done meanwhile.
        setStanding(true);
        pushes = [];
        await coordinating.synchronizeNow();

        expect(accountWorkspaceNames()).toEqual(["A", "B", "C edited"]);
        expect(pushes.flat().map(operation => `${operation.op} ${operation.type}`)).toEqual(["upsert environment"]);
    });

    it("re-reads the lists once on a race for the last slot and leaves out what lost", async () => {
        await appState.replaceCurrentProfileData(profileOf({
            environments: [{ ...environment("a0000000-0000-7000-8000-00000000000a", "A", 0), createdAt: 1 }],
            activeEnvironmentId: "a0000000-0000-7000-8000-00000000000a"
        }));
        const coordinating = coordinator();
        await coordinating.synchronizeNow();
        const profileId = profiles.getActiveProfileId();

        await appState.addWorkspace("Mine");
        // Another installation takes the last free slot a moment before this push arrives.
        beforePush = () => {
            beforePush = null;
            account.apply([{ op: "upsert", type: "environment", id: "e0000000-0000-7000-8000-0000000000ee", profileId, name: "Theirs", position: 1 }]);
            return {
                outcome: "rejected", status: 409, message: "Free plan",
                limitRefusal: { kind: "FREE_PLAN", limit: "WORKSPACES_PER_PROFILE", maximum: 2 }
            };
        };
        pushes = [];

        await coordinating.synchronizeNow();

        expect(pushes).toHaveLength(1);
        expect(coordinating.limitRefusal$.get()).toBeNull();
        expect(accountWorkspaceNames()).toEqual(["A", "Theirs"]);
        // Kept here as local only; the pull brought the other installation's workspace down.
        expect(localWorkspaceNames()).toEqual(["A", "Mine", "Theirs"]);
    });

    it("merges a local-only workspace renamed to the account's name at the next sync", async () => {
        await threeWorkspaces();
        const coordinating = coordinator();
        await coordinating.synchronizeNow();
        expect(accountWorkspaceNames()).toEqual(["A", "B"]);

        // The advice the page gives: rename it to the account's name.
        await appState.renameWorkspace("c0000000-0000-7000-8000-00000000000c", "A", undefined);
        await coordinating.synchronizeNow();

        expect(localWorkspaceNames()).toEqual(["A", "B"]);
        expect(account.snapshot().groups.map(record => record.name)).toContain("Kept");
    });

    it("keeps a new workspace with an existing name separate when it fits a free slot", async () => {
        await appState.replaceCurrentProfileData(profileOf({
            environments: [{ ...environment("a0000000-0000-7000-8000-00000000000a", "Work", 0), createdAt: 1 }],
            groups: [group("a1000000-0000-7000-8000-00000000000a", "Theirs", "a0000000-0000-7000-8000-00000000000a")],
            activeEnvironmentId: "a0000000-0000-7000-8000-00000000000a"
        }));
        const coordinating = coordinator();
        await coordinating.synchronizeNow();

        // Made while synchronising, named like the one already there: a new workspace, not
        // first contact with the old one.
        const state = await appState.addWorkspace("Work");
        await appState.createGroup("Mine", state.activeEnvironmentId!);
        await coordinating.synchronizeNow();

        expect(localWorkspaceNames()).toEqual(["Work", "Work"]);
        expect(accountWorkspaceNames()).toEqual(["Work", "Work"]);
        const groupsByWorkspace = account.snapshot().groups.map(record => record.environmentId);
        expect(new Set(groupsByWorkspace).size).toBe(2);
    });

    it("never sends untouched example data, and sends it once the user changes it", async () => {
        await appState.replaceCurrentProfileData(markedAsExample(buildExampleProfileData()));
        const coordinating = coordinator();

        await coordinating.synchronizeNow();
        expect(account.snapshot().environments).toEqual([]);
        expect(appState.getWorkspaces()).toHaveLength(1);

        const exampleId = appState.getWorkspaces()[0].id;
        await appState.createGroup("My own", exampleId);
        await coordinating.synchronizeNow();

        expect(account.snapshot().environments.map(environment => environment.id)).toEqual([exampleId]);
    });

    it("downloads only what holds a slot when a fresh installation signs in", async () => {
        // What other installations put on the account while it was premium.
        account.apply([
            { op: "upsert", type: "profile", id: "10000000-0000-7000-8000-000000000001", name: "Home", position: 0 },
            { op: "upsert", type: "profile", id: "20000000-0000-7000-8000-000000000002", name: "Work", position: 1 },
            ...["X", "Y", "Z"].map((name, index) => ({
                op: "upsert" as const, type: "environment" as const,
                id: `e000000${index}-0000-7000-8000-00000000000${index}`,
                profileId: "10000000-0000-7000-8000-000000000001", name, position: index
            })),
            { op: "upsert", type: "group", id: "90000000-0000-7000-8000-000000000009", environmentId: "e0000000-0000-7000-8000-000000000000", name: "G", position: 0 },
            { op: "upsert", type: "link", id: "80000000-0000-7000-8000-000000000008", parentGroupId: "90000000-0000-7000-8000-000000000009", title: "L", url: "https://example.com/", position: 0 }
        ]);
        await profiles.renameProfile(profiles.getActiveProfileId(), "Home");

        await coordinator().synchronizeNow();

        expect(profiles.getProfiles().map(profile => profile.name)).toEqual(["Home"]);
        expect(localWorkspaceNames()).toEqual(["X", "Y"]);
        expect(Object.values(appState.state$.get().links).map(record => record.url)).toEqual(["https://example.com/"]);
        // Nothing the account holds was read as a deletion.
        expect(account.snapshot().profiles).toHaveLength(2);
        expect(account.snapshot().environments).toHaveLength(3);
    });

    it("keeps a local-only profile through every pull", async () => {
        const coordinating = coordinator();
        await appState.replaceCurrentProfileData(profileOf({
            environments: [environment("a0000000-0000-7000-8000-00000000000a", "A")],
            links: [], activeEnvironmentId: "a0000000-0000-7000-8000-00000000000a"
        }));
        await coordinating.synchronizeNow();
        setStanding(true);
        const second = await profiles.createProfile("Second");
        setStanding(false);
        await appState.saveProfileData(second!.id, profileOf({
            environments: [environment("b0000000-0000-7000-8000-00000000000b", "B")],
            links: [link("b1000000-0000-7000-8000-00000000000b", "L", "https://example.org/", "g", "b0000000-0000-7000-8000-00000000000b")]
        }));

        await coordinating.synchronizeNow();
        await coordinating.synchronizeNow();

        expect(profiles.getProfiles().map(profile => profile.name)).toContain("Second");
        expect(account.snapshot().profiles).toHaveLength(1);
        expect(coordinating.scope$.get()?.profiles[second!.id].state).toBe("LOCAL_ONLY_FREE_LIMIT");
    });
});
