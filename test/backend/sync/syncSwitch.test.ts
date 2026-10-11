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
import { ObservableValue } from "../../../src/utils/observableValue";
import { FakeAccount } from "../../support/fakeAccount";
import { FakeWebSocket } from "../../support/fakeWebSocket";

/** Longer than the push debounce (0.8 s), so whatever a change scheduled has happened. */
const SETTLING_TIME = 1_500;

const settle = () => new Promise(resolve => setTimeout(resolve, SETTLING_TIME));

/**
 *  Synchronisation switched off on this browser (#80): signed in - premium still applies - but
 *  nothing pushed, nothing pulled, no refresh channel. The case it exists for is somebody who
 *  signs in for premium's limits alone, so "nothing" has to include first contact: storing the
 *  tokens is what used to upload this browser's links.
 */
describe("SyncCoordinator with synchronisation switched off", () => {

    let coordinator: SyncCoordinator;
    let appState: AppStateRepository;
    let syncEnabled$: ObservableValue<boolean>;
    let snapshotReads: number;
    let pushes: SyncOperation[][];

    beforeEach(async () => {
        FakeWebSocket.reset();
        vi.stubGlobal("WebSocket", FakeWebSocket);
        await installationIdentity.init();

        const profiles = new ProfileRepository();
        await profiles.init();
        appState = new AppStateRepository();
        await appState.init(appStateInit, profiles.getActiveProfileId());
        const sessions = new SessionRepository();
        await sessions.init();
        await sessions.storeTokenPair({
            accessToken: "access", accessTokenExpiresInSeconds: 900, refreshToken: "refresh",
            userId: "owner", username: "kovo"
        });
        const baselines = new SyncBaselineRepository();
        await baselines.init();

        snapshotReads = 0;
        pushes = [];
        const account = new FakeAccount();
        const apiClient = {
            fetchSnapshot: () => {
                snapshotReads++;
                return Promise.resolve({ outcome: "success", data: account.snapshot() } as ApiResult<SyncSnapshot>);
            },
            pushChanges: (request: { operations: SyncOperation[] }) => {
                pushes.push(request.operations);
                account.apply(request.operations);
                return Promise.resolve({
                    outcome: "success",
                    data: { appliedAt: "2026-01-01T00:00:00Z", remaps: [], rejected: [] }
                } as ApiResult<SyncPushResult>);
            }
        };
        syncEnabled$ = new ObservableValue<boolean>(false);
        coordinator = new SyncCoordinator(
            appState, profiles, sessions, baselines, apiClient as never, undefined, syncEnabled$);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("neither reads the account nor sends it anything, though signed in", async () => {
        await coordinator.start();
        await settle();

        await appState.addWorkspace("Kept on this browser");
        await settle();

        expect(snapshotReads).toBe(0);
        expect(pushes).toEqual([]);
        expect(FakeWebSocket.opened).toHaveLength(0);
    });

    it("synchronises once switched on, and stops again once switched off", async () => {
        await coordinator.start();
        await settle();

        syncEnabled$.set(true);
        await vi.waitFor(() => expect(snapshotReads).toBeGreaterThan(0), { timeout: 3_000 });
        await vi.waitFor(() => expect(FakeWebSocket.opened).toHaveLength(1));
        FakeWebSocket.latest().acceptStompSession();
        await settle();

        syncEnabled$.set(false);
        await settle();
        const pushesWhenSwitchedOff = pushes.length;
        expect(FakeWebSocket.latest().readyState).toBe(FakeWebSocket.CLOSED);

        await appState.addWorkspace("Made after switching off");
        await settle();

        expect(pushes).toHaveLength(pushesWhenSwitchedOff);
    }, 15_000);
});
