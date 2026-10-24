import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppStateRepository } from "../../../src/backend/repository/AppStateRepository";
import { ProfileRepository } from "../../../src/backend/repository/ProfileRepository";
import { appStateInit } from "../../../src/backend/datasource/init/AppStateInit";
import { ApiResult } from "../../../src/backend/sync/BackendApiClient";
import { installationIdentity } from "../../../src/backend/sync/InstallationIdentity";
import { SessionRepository } from "../../../src/backend/sync/SessionRepository";
import { SyncBaselineRepository } from "../../../src/backend/sync/SyncBaselineRepository";
import { SyncCoordinator } from "../../../src/backend/sync/SyncCoordinator";
import { SyncOperation, SyncPushResult, SyncSnapshot } from "../../../src/backend/sync/SyncContracts";
import { FakeAccount } from "../../support/fakeAccount";
import { FakeWebSocket } from "../../support/fakeWebSocket";

const PROFILE_ID = "10000000-0000-7000-8000-000000000001";
const WORKSPACE_ID = "e0000000-0000-7000-8000-000000000001";

/**
 *  A fresh install signing in from the first-run screen, to an account that already has links.
 *
 *  The defect this pins: the install's seeded profile is an empty "Default", and first contact
 *  paired profiles by name only. An account whose profile is called anything else left that
 *  empty profile open - the page stayed on the first-run screen saying "signed in as", with the
 *  account's workspaces in a second profile nobody had switched to - and pushed it to the
 *  account as a profile more.
 */
describe("a fresh install signing in", () => {

    let account: FakeAccount;
    let appState: AppStateRepository;
    let profiles: ProfileRepository;
    let sessions: SessionRepository;
    let coordinator: SyncCoordinator;

    beforeEach(async () => {
        FakeWebSocket.reset();
        vi.stubGlobal("WebSocket", FakeWebSocket);
        await installationIdentity.init();

        profiles = new ProfileRepository();
        await profiles.init();
        appState = new AppStateRepository();
        await appState.init(appStateInit, profiles.getActiveProfileId());
        sessions = new SessionRepository();
        await sessions.init();
        const baselines = new SyncBaselineRepository();
        await baselines.init();

        account = new FakeAccount();
        account.apply([
            { op: "upsert", type: "profile", id: PROFILE_ID, name: "Personal", position: 0 },
            { op: "upsert", type: "environment", id: WORKSPACE_ID, profileId: PROFILE_ID, name: "Home", position: 0 }
        ]);
        const apiClient = {
            fetchSnapshot: () => Promise.resolve(
                { outcome: "success", data: account.snapshot() } as ApiResult<SyncSnapshot>),
            pushChanges: (request: { operations: SyncOperation[] }) => {
                account.apply(request.operations);
                return Promise.resolve({
                    outcome: "success",
                    data: { appliedAt: "2026-01-01T00:00:00Z", remaps: [], rejected: [] }
                } as ApiResult<SyncPushResult>);
            }
        };
        coordinator = new SyncCoordinator(appState, profiles, sessions, baselines, apiClient as never);
        await coordinator.start();
    });

    afterEach(async () => {
        await sessions.clear();
        vi.unstubAllGlobals();
    });

    it("opens the account's profile when its name is not the install's own", async () => {
        await sessions.storeTokenPair({
            accessToken: "access", accessTokenExpiresInSeconds: 900,
            refreshToken: "refresh", userId: "kovo", username: "kovo"
        });
        await coordinator.synchronizeNow();

        expect(profiles.getProfiles().map(profile => profile.name)).toEqual(["Personal"]);
        expect(appState.getCurrentEnvironment()?.id).toBe(WORKSPACE_ID);
        expect(account.snapshot().profiles.map(profile => profile.id)).toEqual([PROFILE_ID]);
    });
});
