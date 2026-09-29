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

/** Covers the channel's first reconnection delay (1 s) and the pull debounce (0.4 s). */
const RECONNECT_AND_PULL_WAIT = { timeout: 4_000 };

/** Longer than the push debounce (0.8 s), so start-up's own work is over before counting. */
const SETTLING_TIME = 1_500;

const settle = () => new Promise(resolve => setTimeout(resolve, SETTLING_TIME));

/**
 *  A refresh notification is sent once and never replayed. A backend deploy replaces the pod a
 *  browser's socket was connected to; anything another device pushed while this one was
 *  reconnecting was announced to nobody. Before this was pinned, a new tab page left open
 *  through a deploy stayed out of date until something unrelated made it pull.
 */
describe("SyncCoordinator after the refresh channel reconnects", () => {

    let coordinator: SyncCoordinator;
    let snapshotReads: number;

    beforeEach(async () => {
        FakeWebSocket.reset();
        vi.stubGlobal("WebSocket", FakeWebSocket);
        await installationIdentity.init();

        const profiles = new ProfileRepository();
        await profiles.init();
        const appState = new AppStateRepository();
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
        // An account that keeps what it is sent, so that first contact completes and the device
        // settles: after that, the only thing that reads the account is a pull.
        const account = new FakeAccount();
        const apiClient = {
            fetchSnapshot: () => {
                snapshotReads++;
                return Promise.resolve({ outcome: "success", data: account.snapshot() } as ApiResult<SyncSnapshot>);
            },
            pushChanges: (request: { operations: SyncOperation[] }) => {
                account.apply(request.operations);
                return Promise.resolve({
                    outcome: "success",
                    data: { appliedAt: "2026-01-01T00:00:00Z", remaps: [], rejected: [] }
                } as ApiResult<SyncPushResult>);
            }
        };
        coordinator = new SyncCoordinator(appState, profiles, sessions, baselines, apiClient as never);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("pulls once the channel is back, since what it announced meanwhile reached nobody", async () => {
        await coordinator.start();
        await vi.waitFor(() => expect(FakeWebSocket.opened).toHaveLength(1));
        FakeWebSocket.latest().acceptStompSession();
        await settle();
        const readsBeforeTheDrop = snapshotReads;

        FakeWebSocket.latest().dropFromServer();
        await vi.waitFor(() => expect(FakeWebSocket.opened).toHaveLength(2), RECONNECT_AND_PULL_WAIT);
        FakeWebSocket.latest().acceptStompSession();

        await vi.waitFor(() => expect(snapshotReads).toBeGreaterThan(readsBeforeTheDrop),
            RECONNECT_AND_PULL_WAIT);
    });

    /** The control: without a reconnection nothing reads the account, so the test above is not
     *  passing on some unrelated pull. */
    it("reads nothing while the channel stays up", async () => {
        await coordinator.start();
        await vi.waitFor(() => expect(FakeWebSocket.opened).toHaveLength(1));
        FakeWebSocket.latest().acceptStompSession();
        await settle();
        const readsAfterSettling = snapshotReads;

        await settle();

        expect(snapshotReads).toBe(readsAfterSettling);
    });
});
