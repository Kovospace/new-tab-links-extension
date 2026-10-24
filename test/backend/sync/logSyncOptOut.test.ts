import { beforeEach, describe, expect, it } from "vitest";

import { AppStateRepository } from "../../../src/backend/repository/AppStateRepository";
import { ProfileRepository } from "../../../src/backend/repository/ProfileRepository";
import { readClosedTabs, recordClosedTab } from "../../../src/backend/repository/ClosedTabsRepository";
import { LogSync } from "../../../src/backend/repository/DevicePreferencesRepository";
import { stateWithLinks } from "../../support/profileDataFixtures";
import { ApiResult } from "../../../src/backend/sync/BackendApiClient";
import { installationIdentity } from "../../../src/backend/sync/InstallationIdentity";
import { SessionRepository } from "../../../src/backend/sync/SessionRepository";
import { SyncBaselineRepository } from "../../../src/backend/sync/SyncBaselineRepository";
import { SyncCoordinator } from "../../../src/backend/sync/SyncCoordinator";
import { SyncOperation, SyncPushResult, SyncSnapshot } from "../../../src/backend/sync/SyncContracts";
import { ObservableValue } from "../../../src/utils/observableValue";
import { FakeAccount } from "../../support/fakeAccount";

/**
 *  A log left out of synchronisation on this browser (`syncClosedTabs`, #97) while everything
 *  else synchronises. Off has to be the same as being offline for that log alone: nothing of it
 *  sent, nothing of the account's written over this device's own list - and, the part that is
 *  easy to get wrong, switching it back on must send what was recorded meanwhile without
 *  reading what other devices recorded meanwhile as deletions.
 */
describe("a log this browser does not synchronise", () => {

    let appState: AppStateRepository;
    let profiles: ProfileRepository;
    let sessions: SessionRepository;
    let baselines: SyncBaselineRepository;
    let account: FakeAccount;
    let pushes: SyncOperation[][];
    let logSync: ObservableValue<LogSync>;
    let profileId: string;

    beforeEach(async () => {
        await installationIdentity.init();
        profiles = new ProfileRepository();
        await profiles.init();
        appState = new AppStateRepository();
        await appState.init(stateWithLinks(), profiles.getActiveProfileId());
        profileId = profiles.getActiveProfileId();

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
        logSync = new ObservableValue<LogSync>({ closedTabs: true, visits: true });
    });

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
            appState, profiles, sessions, baselines, apiClient as never, undefined, undefined, logSync);
    }

    const closedTabOperations = () => pushes.flat().filter(operation => operation.type === "closedTab");
    const urlsHere = async () => Object.values(await readClosedTabs(profileId)).map(tab => tab.url).sort();

    /** A tab another browser closed, as the account holds it. */
    function closedElsewhere(id: string, url: string): void {
        account.apply([{
            op: "upsert", type: "closedTab", id, profileId, url, title: id,
            closedAt: "2026-01-01T10:00:00Z", deviceName: "Laptop"
        }]);
    }

    const closedHere = (url: string, at: number) =>
        recordClosedTab(profileId, { url, title: url, closedAt: at });

    it("sends none of it, keeps its own list through a pull, and settles", async () => {
        logSync.set({ closedTabs: false, visits: true });
        await closedHere("https://example.com/here", 1_700_000_000_000);
        const syncing = coordinator();
        await syncing.synchronizeNow();
        closedElsewhere("from-laptop", "https://example.com/laptop");

        await syncing.synchronizeNow();
        pushes = [];
        await syncing.synchronizeNow();

        expect(closedTabOperations()).toEqual([]);
        expect(pushes.flat()).toEqual([]);
        expect(await urlsHere()).toEqual(["https://example.com/here"]);
    });

    it("switched back on, sends what was recorded meanwhile and deletes nothing from elsewhere",
        async () => {
            await closedHere("https://example.com/before", 1_700_000_000_000);
            const syncing = coordinator();
            await syncing.synchronizeNow();

            logSync.set({ closedTabs: false, visits: true });
            closedElsewhere("from-laptop", "https://example.com/laptop");
            await closedHere("https://example.com/meanwhile", 1_700_000_001_000);
            await syncing.synchronizeNow();

            logSync.set({ closedTabs: true, visits: true });
            pushes = [];
            await syncing.synchronizeNow();

            expect(closedTabOperations().filter(operation => operation.op === "delete")).toEqual([]);
            expect(closedTabOperations().map(operation => (operation as { url?: string }).url))
                .toEqual(["https://example.com/meanwhile"]);
            expect(await urlsHere()).toEqual([
                "https://example.com/before", "https://example.com/laptop", "https://example.com/meanwhile"
            ]);

            pushes = [];
            await syncing.synchronizeNow();
            expect(pushes.flat()).toEqual([]);
        });

    it("off at first contact, joins the two lists once it is switched on", async () => {
        closedElsewhere("from-laptop", "https://example.com/laptop");
        await closedHere("https://example.com/here", 1_700_000_000_000);
        logSync.set({ closedTabs: false, visits: true });
        const syncing = coordinator();
        await syncing.synchronizeNow();
        expect(await urlsHere()).toEqual(["https://example.com/here"]);

        logSync.set({ closedTabs: true, visits: true });
        pushes = [];
        await syncing.synchronizeNow();

        expect(closedTabOperations().filter(operation => operation.op === "delete")).toEqual([]);
        expect(await urlsHere()).toEqual(["https://example.com/here", "https://example.com/laptop"]);
    });
});
