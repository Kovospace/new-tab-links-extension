import { beforeEach, describe, expect, it } from "vitest";

import { AppStateRepository } from "../../../src/backend/repository/AppStateRepository";
import { ProfileRepository } from "../../../src/backend/repository/ProfileRepository";
import { appStateInit } from "../../../src/backend/datasource/init/AppStateInit";
import { ApiResult } from "../../../src/backend/sync/BackendApiClient";
import { installationIdentity } from "../../../src/backend/sync/InstallationIdentity";
import { SessionRepository } from "../../../src/backend/sync/SessionRepository";
import { SyncBaselineRepository } from "../../../src/backend/sync/SyncBaselineRepository";
import { SyncCoordinator, SyncRejectionNotice } from "../../../src/backend/sync/SyncCoordinator";
import {
    SyncIdentifierRemap, SyncOperation, SyncPushResult, SyncRejectedOperation, SyncSnapshot
} from "../../../src/backend/sync/SyncContracts";
import { FakeAccount } from "../../support/fakeAccount";

const NOW = "2026-01-01T00:00:00Z";

/**
 *  **A record the account refused must not disappear without a word.**
 *
 *  The refusal itself is ordinary and is not the bug: an operation naming a group another
 *  device has deleted cannot be applied, and the account says so per operation rather than
 *  failing the whole batch. What happened next was the bug. A push that was refused anything
 *  leaves the baseline where it is and returns, deliberately, so that the pull behind it can
 *  correct this device wholesale - and that pull replaces the profile with what the account
 *  holds, which is everything except the record just refused. So the user watched a workspace
 *  they had made a moment earlier vanish, with nothing said anywhere but a console warning.
 *
 *  Losing it is arguably right: the account is authoritative and the record was never stored
 *  there. Losing it *silently* is not, and that is what these tests pin. They say nothing
 *  about limits or entitlements - the two reasons the account can already give today are
 *  enough to reach this, and PARENT_NOT_FOUND is the one used throughout.
 */
describe("a change the account refuses is reported to the user", () => {

    let appState: AppStateRepository;
    let profiles: ProfileRepository;
    let sessions: SessionRepository;
    let baselines: SyncBaselineRepository;
    let account: FakeAccount;

    /** What the account refuses this time; permissive until a test says otherwise. */
    let refuses: (operation: SyncOperation) => boolean;

    /** What the account cannot store under the identifier it was given. */
    let remaps: SyncIdentifierRemap[];

    /**
     *  Whether the snapshot can be read.
     *
     *  Turning it off is how a refused record is kept in local state: the pull that would
     *  take it away never happens, so the next push offers it again, which is the everyday
     *  case a debounced push makes over and over.
     */
    let accountReachable: boolean;

    /** Every notice a subscriber was actually handed, which is what "told" means. */
    let told: SyncRejectionNotice[];

    beforeEach(async () => {
        await installationIdentity.init();

        profiles = new ProfileRepository();
        await profiles.init();

        appState = new AppStateRepository();
        // The seed data every fresh install starts with: workspaces, groups, subgroups, links.
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
        refuses = () => false;
        remaps = [];
        accountReachable = true;
        told = [];
    });

    /**
     *  A coordinator talking to an account that refuses whatever `refuses` picks out.
     *
     *  Refused operations are not applied and come back in `rejected`, exactly as the backend
     *  documents: the rest of the batch still lands, so this is a partial refusal and not a
     *  failed push.
     */
    function coordinator(): SyncCoordinator {
        const apiClient = {
            fetchSnapshot: () => Promise.resolve(accountReachable
                ? { outcome: "success", data: account.snapshot() } as ApiResult<SyncSnapshot>
                : { outcome: "offline", message: "unreachable" } as ApiResult<SyncSnapshot>),
            pushChanges: (request: { operations: SyncOperation[] }) => {
                const rejected: SyncRejectedOperation[] = [];
                const applied: SyncOperation[] = [];

                request.operations.forEach((operation, index) => {
                    if (refuses(operation)) {
                        rejected.push({
                            index, type: operation.type, id: operation.id,
                            reason: "PARENT_NOT_FOUND"
                        });
                        return;
                    }
                    applied.push(operation);
                });
                account.apply(applied);

                return Promise.resolve({
                    outcome: "success",
                    data: { appliedAt: NOW, remaps, rejected }
                } as ApiResult<SyncPushResult>);
            }
        };
        const coordinating = new SyncCoordinator(
            appState, profiles, sessions, baselines, apiClient as never);

        // Subscribing fires straight away with whatever is there now, which is nothing yet.
        // Only what arrives afterwards is the user being told something.
        coordinating.rejections$.subscribe(notice => {
            if (notice) {
                told.push(notice);
            }
        });
        return coordinating;
    }

    /**
     *  A device in step with its account, about to make one change of its own.
     *
     *  The first synchronisation is what establishes the baseline; without it the next push
     *  takes the first-contact path, which withholds deletions and merges rather than
     *  computing an ordinary difference.
     */
    async function deviceInStepWithItsAccount(): Promise<SyncCoordinator> {
        const coordinating = coordinator();
        await coordinating.synchronizeNow();
        told.length = 0;
        return coordinating;
    }

    /** Makes a workspace the account is going to refuse, and answers with its identifier. */
    async function makeAWorkspaceTheAccountWillRefuse(): Promise<string> {
        const state = await appState.addWorkspace("Refused", undefined);
        const workspaceId = state.activeEnvironmentId!;

        refuses = operation =>
            operation.type === "environment" && operation.id === workspaceId;

        return workspaceId;
    }

    it("tells the user when the account refuses a change", async () => {
        const coordinating = await deviceInStepWithItsAccount();
        const workspaceId = await makeAWorkspaceTheAccountWillRefuse();

        await coordinating.synchronizeNow();

        expect(told).toHaveLength(1);
        expect(told[0].records.map(record => record.id)).toEqual([workspaceId]);
        expect(told[0].records[0].reason).toBe("PARENT_NOT_FOUND");
    });

    it("names the kind of record that was refused, so the notice can say what was lost",
        async () => {
            const coordinating = await deviceInStepWithItsAccount();
            await makeAWorkspaceTheAccountWillRefuse();

            await coordinating.synchronizeNow();

            expect(told[0].records[0].type).toBe("environment");
        });

    it("still loses the refused record, which is exactly why the user has to be told",
        async () => {
            // Not the behaviour being changed, and pinned so that a later change to the pull
            // has to notice it. The account is authoritative and never stored this workspace,
            // so the pull behind the push is right to take it away. Doing that without saying
            // anything is the defect.
            const coordinating = await deviceInStepWithItsAccount();
            const workspaceId = await makeAWorkspaceTheAccountWillRefuse();

            await coordinating.synchronizeNow();

            expect(appState.getWorkspaces().map(workspace => workspace.id))
                .not.toContain(workspaceId);
        });

    it("says nothing at all when the account applies everything", async () => {
        const coordinating = await deviceInStepWithItsAccount();
        await appState.addWorkspace("Accepted", undefined);

        await coordinating.synchronizeNow();

        expect(told).toEqual([]);
    });

    it("says nothing when the account merely stored something under its own identifier",
        async () => {
            // A remap is not a loss: the record is on the account, under a name of the
            // server's choosing, and the pull brings it back. Reporting it would teach the
            // user to ignore the notice that does mean something.
            const coordinating = await deviceInStepWithItsAccount();
            await appState.addWorkspace("Remapped", undefined);
            remaps = [{ type: "environment", clientId: "client", serverId: "server" }];

            await coordinating.synchronizeNow();

            expect(told).toEqual([]);
        });

    it("does not repeat itself while the same record keeps being refused", async () => {
        // A push is debounced behind every local change, and a refused record that is still
        // in local state is offered again on each one. Saying it once is telling the user;
        // saying it every time is teaching them to dismiss it unread.
        //
        // The account is unreachable for reading here, which is what keeps the record: the
        // pull that would take it away cannot run, so all three pushes send it and all three
        // are refused. With a working pull this would report once however it behaved, and
        // the test would be proving nothing.
        const coordinating = await deviceInStepWithItsAccount();
        await makeAWorkspaceTheAccountWillRefuse();
        accountReachable = false;

        await coordinating.synchronizeNow();
        await coordinating.synchronizeNow();
        await coordinating.synchronizeNow();

        expect(told).toHaveLength(1);
    });

    it("keeps offering the record it was refused, so the silence is not a lost push",
        async () => {
            // Guards the test above from passing for the wrong reason: it only means
            // anything if the same refusal really did happen three times.
            let refusals = 0;
            const coordinating = await deviceInStepWithItsAccount();
            const workspaceId = await makeAWorkspaceTheAccountWillRefuse();
            const refusing = refuses;
            refuses = operation => {
                if (refusing(operation)) {
                    refusals += 1;
                    return true;
                }
                return false;
            };
            accountReachable = false;

            await coordinating.synchronizeNow();
            await coordinating.synchronizeNow();
            await coordinating.synchronizeNow();

            expect(refusals).toBe(3);
            expect(appState.getWorkspaces().map(workspace => workspace.id))
                .toContain(workspaceId);
        });

    it("speaks again about the same record after a synchronisation that went through",
        async () => {
            // The memory that stops it repeating must not outlive the trouble. The same
            // record refused, accepted, and refused again is two things that happened to the
            // user, not one - and because the signature is identical both times, this is
            // what proves the memory is actually cleared rather than merely never matching.
            const coordinating = await deviceInStepWithItsAccount();
            const workspaceId = await makeAWorkspaceTheAccountWillRefuse();
            accountReachable = false;

            await coordinating.synchronizeNow();

            refuses = () => false;
            await coordinating.synchronizeNow();

            refuses = operation =>
                operation.type === "environment" && operation.id === workspaceId;
            // Something has to differ, or there is no operation left to refuse: the account
            // accepted the workspace a moment ago and the baseline now holds it.
            await appState.renameWorkspace(workspaceId, "Refused again", undefined);
            await coordinating.synchronizeNow();

            expect(told).toHaveLength(2);
            expect(told[0].records[0].id).toBe(workspaceId);
            expect(told[1].records[0].id).toBe(workspaceId);
        });
});
