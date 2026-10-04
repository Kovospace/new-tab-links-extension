import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppStateRepository } from "../../../src/backend/repository/AppStateRepository";
import { ProfileRepository } from "../../../src/backend/repository/ProfileRepository";
import { appStateInit } from "../../../src/backend/datasource/init/AppStateInit";
import { ApiResult, BackendApiClient } from "../../../src/backend/sync/BackendApiClient";
import { installationIdentity } from "../../../src/backend/sync/InstallationIdentity";
import { SESSION_KEY, SessionRepository } from "../../../src/backend/sync/SessionRepository";
import { SyncBaselineRepository } from "../../../src/backend/sync/SyncBaselineRepository";
import { SyncCoordinator } from "../../../src/backend/sync/SyncCoordinator";
import { SyncOperation, SyncPushResult, SyncSnapshot } from "../../../src/backend/sync/SyncContracts";
import { LimitRefusal } from "../../../src/backend/entity/FreePlanLimits";
import { fairUseRefusals } from "../../../src/backend/repository/FairUseRefusals";
import { premiumStanding$ } from "../../../src/backend/repository/PremiumStanding";
import { FakeAccount } from "../../support/fakeAccount";
import { seedFakeStorage } from "../../support/chromeStorageStub";

const NOW = "2026-01-01T00:00:00Z";

/**
 *  The backend's refusal of a push over a fair use limit: HTTP 409 in its uniform error body,
 *  with `code`, `limit` and `maximum` beside the usual fields.
 */
function fairUseBody(limit: string, maximum: number): Record<string, unknown> {
    return {
        timestamp: NOW, status: 409, error: "Conflict",
        message: `Fair use limit ${limit} reached`, validationErrors: [],
        code: "FAIR_USE_LIMIT_REACHED", limit, maximum
    };
}

describe("BackendApiClient reading a fair use refusal", () => {

    let answer: { status: number; body: unknown };

    beforeEach(() => {
        seedFakeStorage(SESSION_KEY, {
            accessToken: "access", refreshToken: "refresh", userId: "u1", username: "someone",
            deviceId: null, accessTokenExpiresAt: Date.now() + 15 * 60 * 1000
        });
        vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(
            new Response(JSON.stringify(answer.body), { status: answer.status }))));
    });

    afterEach(() => vi.unstubAllGlobals());

    async function push(): Promise<ApiResult<SyncPushResult>> {
        const sessions = new SessionRepository();
        await sessions.init();
        return new BackendApiClient(sessions).pushChanges({ originDeviceId: "d", operations: [] });
    }

    it("recognises the code and carries the limit and the server's maximum", async () => {
        answer = { status: 409, body: fairUseBody("LINKS_PER_WORKSPACE", 750) };

        const result = await push();

        expect(result).toMatchObject({
            outcome: "rejected", status: 409,
            limitRefusal: { limit: "LINKS_PER_WORKSPACE", maximum: 750 }
        });
    });

    it("falls back to this extension's number when the body has none", async () => {
        answer = { status: 409, body: { ...fairUseBody("PROFILES", 0), maximum: undefined } };

        expect(await push()).toMatchObject({ limitRefusal: { limit: "PROFILES", maximum: 50 } });
    });

    it("leaves any other 409, and a limit it does not know, an ordinary rejection", async () => {
        answer = { status: 409, body: { status: 409, error: "Conflict", message: "Taken" } };
        expect((await push() as { limitRefusal?: unknown }).limitRefusal).toBeUndefined();

        answer = { status: 409, body: fairUseBody("DEVICES", 5) };
        expect((await push() as { limitRefusal?: unknown }).limitRefusal).toBeUndefined();
    });
});

/**
 *  A push the account refuses over a fair use limit is refused whole: nothing in it was
 *  applied. Three things must follow, and each is a way the ordinary rejected-push path would
 *  have gone wrong:
 *
 *  - the pull behind the push must not run, because it would replace local data with the
 *    account's and so delete exactly what was refused - the one thing the policy promises
 *    never happens;
 *  - the same change set must not be sent again and again, or a full account turns every
 *    local change, and every page, into another doomed request;
 *  - the user is told in the limit's own words, and told once.
 */
describe("SyncCoordinator when the account refuses over a fair use limit", () => {

    let appState: AppStateRepository;
    let profiles: ProfileRepository;
    let sessions: SessionRepository;
    let baselines: SyncBaselineRepository;
    let account: FakeAccount;

    let refusing: LimitRefusal | null;
    let pushes: number;
    let snapshotReads: number;
    let notices: string[];
    let stopListening: () => void;

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
        refusing = null;
        pushes = 0;
        snapshotReads = 0;
        notices = [];
        stopListening = fairUseRefusals.refusals$.subscribe(notice => {
            if (notice) notices.push(notice.limit);
        });
        notices.length = 0;
    });

    // The fair use limits cap premium; without it the free plan's lower ones would bind first.
    beforeEach(() => premiumStanding$.set(true));

    afterEach(() => {
        stopListening();
        premiumStanding$.set(false);
    });

    function coordinator(): SyncCoordinator {
        const apiClient = {
            fetchSnapshot: () => {
                snapshotReads++;
                return Promise.resolve({ outcome: "success", data: account.snapshot() } as ApiResult<SyncSnapshot>);
            },
            pushChanges: (request: { operations: SyncOperation[] }) => {
                pushes++;
                if (refusing) {
                    return Promise.resolve({
                        outcome: "rejected", status: 409, message: "Fair use", limitRefusal: refusing
                    } as ApiResult<SyncPushResult>);
                }
                account.apply(request.operations);
                return Promise.resolve({
                    outcome: "success", data: { appliedAt: NOW, remaps: [], rejected: [] }
                } as ApiResult<SyncPushResult>);
            }
        };
        return new SyncCoordinator(appState, profiles, sessions, baselines, apiClient as never);
    }

    /** What the debounced push after a local change runs; private, so reached through a cast. */
    function pushAfterLocalChange(coordinating: SyncCoordinator): Promise<void> {
        return (coordinating as unknown as {
            push(occasion: string, afterLocalChange: boolean): Promise<void>
        }).push("steady-state", true);
    }

    async function inStep(): Promise<SyncCoordinator> {
        const coordinating = coordinator();
        await coordinating.synchronizeNow();
        pushes = 0;
        snapshotReads = 0;
        return coordinating;
    }

    async function addWorkspaceTheAccountRefuses(): Promise<string> {
        const state = await appState.addWorkspace("Over the limit", undefined);
        refusing = { limit: "WORKSPACES", maximum: 50 };
        return state.activeEnvironmentId!;
    }

    it("keeps what was refused on this device and does not pull over it", async () => {
        const coordinating = await inStep();
        const workspaceId = await addWorkspaceTheAccountRefuses();

        await coordinating.synchronizeNow();

        expect(coordinating.limitRefusal$.get()).toEqual({ limit: "WORKSPACES", maximum: 50 });
        expect(appState.getWorkspaces().map(workspace => workspace.id)).toContain(workspaceId);
        expect(snapshotReads).toBe(0);
    });

    it("does not send the same refused change set again after local changes that alter nothing", async () => {
        const coordinating = await inStep();
        await addWorkspaceTheAccountRefuses();

        await pushAfterLocalChange(coordinating);
        await pushAfterLocalChange(coordinating);
        await pushAfterLocalChange(coordinating);

        expect(pushes).toBe(1);
        expect(notices).toEqual(["WORKSPACES"]);
    });

    it("tries again once what would be sent has changed", async () => {
        const coordinating = await inStep();
        const workspaceId = await addWorkspaceTheAccountRefuses();
        await pushAfterLocalChange(coordinating);

        await appState.renameWorkspace(workspaceId, "Renamed", undefined);
        await pushAfterLocalChange(coordinating);

        expect(pushes).toBe(2);
        // Still the same limit standing: told once, not again.
        expect(notices).toEqual(["WORKSPACES"]);
    });

    it("says nothing in a notice when a page opening finds the refusal, only in the status", async () => {
        const coordinating = await inStep();
        await addWorkspaceTheAccountRefuses();

        await coordinating.synchronizeNow();

        expect(notices).toEqual([]);
        expect(coordinating.limitRefusal$.get()?.limit).toBe("WORKSPACES");
    });

    it("resumes, and pulls again, once the account takes the push", async () => {
        const coordinating = await inStep();
        const workspaceId = await addWorkspaceTheAccountRefuses();
        await coordinating.synchronizeNow();

        // Room made elsewhere; a change notification or a new page runs push-then-pull.
        refusing = null;
        await coordinating.synchronizeNow();

        expect(coordinating.limitRefusal$.get()).toBeNull();
        expect(snapshotReads).toBe(1);
        expect(account.snapshot().environments.map(environment => environment.id))
            .toContain(workspaceId);
    });
});
