import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppStateRepository } from "../../../src/backend/repository/AppStateRepository";
import { ProfileRepository } from "../../../src/backend/repository/ProfileRepository";
import { stateWithLinks } from "../../support/profileDataFixtures";
import { ApiResult } from "../../../src/backend/sync/BackendApiClient";
import { installationIdentity } from "../../../src/backend/sync/InstallationIdentity";
import { SessionRepository } from "../../../src/backend/sync/SessionRepository";
import { SyncBaselineRepository } from "../../../src/backend/sync/SyncBaselineRepository";
import { SyncCoordinator } from "../../../src/backend/sync/SyncCoordinator";
import { SyncOperation, SyncPushResult, SyncSnapshot } from "../../../src/backend/sync/SyncContracts";
import { FakeAccount } from "../../support/fakeAccount";
import { FakeWebSocket } from "../../support/fakeWebSocket";

/**
 *  Local data belongs to the account it was synchronised with.
 *
 *  The defect this pins: signing out kept the links and forgot whose they were, so the next
 *  account to sign in met them as its own on first contact and was sent every one of them. On a
 *  browser two people share, one person's links ended up in the other's account, on every
 *  device that account uses.
 *
 *  Two accounts, alice and bob, each a FakeAccount behind one API client that answers as
 *  whichever of them is signed in - which is what the real backend does with a bearer token.
 */
describe("profiles on this browser belong to the account they were synchronised with", () => {

    let accounts: Record<string, FakeAccount>;
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
        // The seed data a fresh install starts with, belonging to no account yet.
        await appState.init(stateWithLinks(), profiles.getActiveProfileId());
        sessions = new SessionRepository();
        await sessions.init();
        const baselines = new SyncBaselineRepository();
        await baselines.init();

        accounts = { alice: new FakeAccount(), bob: new FakeAccount() };
        const signedInAccount = () => accounts[sessions.getSession()!.userId];
        const apiClient = {
            fetchSnapshot: () => Promise.resolve(
                { outcome: "success", data: signedInAccount().snapshot() } as ApiResult<SyncSnapshot>),
            pushChanges: (request: { operations: SyncOperation[] }) => {
                signedInAccount().apply(request.operations);
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
        // Signing out stops the coordinator's timers, so none of them fires into the next test.
        await sessions.clear();
        vi.unstubAllGlobals();
    });

    /** Signs in and waits until that account has been synchronised. */
    async function signIn(userId: string): Promise<void> {
        await sessions.storeTokenPair({
            accessToken: `access-${userId}`, accessTokenExpiresInSeconds: 900,
            refreshToken: `refresh-${userId}`, userId, username: userId
        });
        await coordinator.synchronizeNow();
    }

    async function signOut(): Promise<void> {
        await sessions.clear();
    }

    const visibleProfileIds = () => profiles.getProfiles().map(profile => profile.id).sort();
    const linkIdsIn = (account: FakeAccount) => account.snapshot().links.map(link => link.id).sort();
    const profileIdsIn = (account: FakeAccount) => account.snapshot().profiles.map(profile => profile.id).sort();

    it("a browser that never synchronised merges into the first account, which then owns it", async () => {
        await signIn("alice");

        expect(linkIdsIn(accounts.alice).length).toBeGreaterThan(0);
        expect(profiles.getOwner()).toEqual({ accountId: "alice", username: "alice" });
    });

    it("after signing out, the links stay visible and still belong to the account", async () => {
        await signIn("alice");
        const aliceProfiles = visibleProfileIds();

        await signOut();

        expect(visibleProfileIds()).toEqual(aliceProfiles);
        expect(profiles.getOwner()?.username).toBe("alice");
    });

    it("another account signing in is sent nothing of the first account's, and sees its own", async () => {
        await signIn("alice");
        const aliceProfiles = profileIdsIn(accounts.alice);
        await signOut();

        await signIn("bob");

        expect(linkIdsIn(accounts.bob)).toEqual([]);
        expect(profileIdsIn(accounts.bob).filter(id => aliceProfiles.includes(id))).toEqual([]);
        expect(visibleProfileIds().filter(id => aliceProfiles.includes(id))).toEqual([]);
        expect(profiles.getOwner()?.username).toBe("bob");
    });

    it("the first account signing in again gets its own profiles back, untouched", async () => {
        await signIn("alice");
        const aliceProfiles = visibleProfileIds();
        const aliceLinks = linkIdsIn(accounts.alice);
        await signOut();
        await signIn("bob");
        await signOut();

        await signIn("alice");

        expect(visibleProfileIds()).toEqual(aliceProfiles);
        expect(linkIdsIn(accounts.alice)).toEqual(aliceLinks);
        expect(profiles.getOwner()?.username).toBe("alice");
    });

    /**
     *  Signing out used to clear the baseline, so coming back was a first contact - and first
     *  contact never pushes a deletion. The link removed while signed out came back.
     */
    it("a link deleted while signed out is deleted in the account on the next sign-in", async () => {
        await signIn("alice");
        const [deletedLinkId] = Object.keys(appState.state$.get().links);
        expect(linkIdsIn(accounts.alice)).toContain(deletedLinkId);
        await signOut();

        await appState.deleteLink(deletedLinkId);
        await signIn("alice");

        expect(linkIdsIn(accounts.alice)).not.toContain(deletedLinkId);
        expect(Object.keys(appState.state$.get().links)).not.toContain(deletedLinkId);
    });
});
