import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dialogs = vi.hoisted(() => ({
    shown: [] as { title: string; message: string; values: string[] }[],
    answer: "ok" as string | null
}));

vi.mock("../../../src/ui/partials/choiceDialog", () => ({
    ChoiceDialog: class {
        constructor(
            private readonly title: string,
            private readonly message: string,
            private readonly choices: { value: string }[]
        ) {}
        ask(): Promise<string | null> {
            dialogs.shown.push({
                title: this.title, message: this.message, values: this.choices.map(choice => choice.value)
            });
            return Promise.resolve(dialogs.answer);
        }
    }
}));

import { AppStateRepository } from "../../../src/backend/repository/AppStateRepository";
import { ProfileRepository } from "../../../src/backend/repository/ProfileRepository";
import { appStateInit } from "../../../src/backend/datasource/init/AppStateInit";
import { ApiResult, BackendApiClient } from "../../../src/backend/sync/BackendApiClient";
import { installationIdentity } from "../../../src/backend/sync/InstallationIdentity";
import { SESSION_KEY, SessionRepository, TokenPairDto } from "../../../src/backend/sync/SessionRepository";
import { SyncBaselineRepository } from "../../../src/backend/sync/SyncBaselineRepository";
import { SyncCoordinator } from "../../../src/backend/sync/SyncCoordinator";
import { SyncOperation, SyncPushResult, SyncSnapshot } from "../../../src/backend/sync/SyncContracts";
import { AccountStandingRepository } from "../../../src/backend/sync/AccountStandingRepository";
import { LimitRefusal } from "../../../src/backend/entity/PlanLimits";
import { fairUseRefusals } from "../../../src/backend/repository/FairUseRefusals";
import { setStanding } from "../../support/standing";
import { SyncAccountViewModel } from "../../../src/viewModel/syncAccountViewModel";
import { FakeAccount } from "../../support/fakeAccount";
import { seedFakeStorage } from "../../support/chromeStorageStub";

const NOW = "2026-01-01T00:00:00Z";

/** The backend's refusal of a free account going past a free plan limit. */
function freePlanBody(limit: string, maximum: number): Record<string, unknown> {
    return {
        timestamp: NOW, status: 409, error: "Conflict",
        message: `Free plan limit ${limit} reached`, validationErrors: [],
        code: "FREE_PLAN_LIMIT_REACHED", limit, maximum
    };
}

describe("BackendApiClient reading a free plan refusal", () => {

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

    async function client(): Promise<BackendApiClient> {
        const sessions = new SessionRepository();
        await sessions.init();
        return new BackendApiClient(sessions);
    }

    it.each([["WORKSPACES_PER_PROFILE", 2], ["PROFILES", 1]])("reads %s on a push", async (limit, maximum) => {
        answer = { status: 409, body: freePlanBody(limit, maximum) };

        const result = await (await client()).pushChanges({ originDeviceId: "d", operations: [] });

        expect(result).toMatchObject({
            outcome: "rejected", status: 409, limitRefusal: { kind: "FREE_PLAN", limit, maximum }
        });
    });

    it("reads DEVICES on a sign-in and on redeeming a pairing code", async () => {
        answer = { status: 409, body: freePlanBody("DEVICES", 5) };
        const api = await client();

        expect(await api.logInWithPassword("someone", "secret"))
            .toMatchObject({ limitRefusal: { kind: "FREE_PLAN", limit: "DEVICES", maximum: 5 } });
        expect(await api.redeemConnectCode("ABCD-1234"))
            .toMatchObject({ limitRefusal: { kind: "FREE_PLAN", limit: "DEVICES", maximum: 5 } });
    });

    it("leaves a free plan limit it does not know an ordinary rejection", async () => {
        // The name the backend used before limits were counted per profile.
        answer = { status: 409, body: freePlanBody("WORKSPACES", 10) };

        const result = await (await client()).pushChanges({ originDeviceId: "d", operations: [] });

        expect((result as { limitRefusal?: unknown }).limitRefusal).toBeUndefined();
    });
});

/**
 *  A free account refusing a push over the free plan's workspaces or profiles is handled
 *  exactly as a fair use refusal: no pull over what was refused, no resending the same change
 *  set, the limit in the account menu's status, one notice - offering the upgrade.
 */
describe("SyncCoordinator when a free account refuses over a free plan limit", () => {

    let appState: AppStateRepository;
    let profiles: ProfileRepository;
    let sessions: SessionRepository;
    let baselines: SyncBaselineRepository;
    let account: FakeAccount;

    let refusing: LimitRefusal | null;
    let pushes: number;
    let snapshotReads: number;
    let notices: LimitRefusal[];
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
        // Last known premium, so this device adds freely; the account has since lapsed to
        // free, and it is the account that refuses.
        setStanding(true);

        account = new FakeAccount();
        refusing = null;
        pushes = 0;
        snapshotReads = 0;
        notices = [];
        stopListening = fairUseRefusals.refusals$.subscribe(notice => {
            if (notice) notices.push(notice);
        });
        notices.length = 0;
    });

    afterEach(() => {
        stopListening();
        setStanding(false);
    });

    function coordinator(): SyncCoordinator {
        const apiClient = {
            ...account.listEndpoints(),
            fetchSnapshot: () => {
                snapshotReads++;
                return Promise.resolve({ outcome: "success", data: account.snapshot() } as ApiResult<SyncSnapshot>);
            },
            pushChanges: (request: { operations: SyncOperation[] }) => {
                pushes++;
                if (refusing) {
                    return Promise.resolve({
                        outcome: "rejected", status: 409, message: "Free plan", limitRefusal: refusing
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

    it("WORKSPACES: keeps the refused workspace, does not pull, does not resend, tells once", async () => {
        const coordinating = await inStep();
        const state = await appState.addWorkspace("Third");
        const workspaceId = state.activeEnvironmentId!;
        refusing = { kind: "FREE_PLAN", limit: "WORKSPACES_PER_PROFILE", maximum: 2 };

        await pushAfterLocalChange(coordinating);
        await pushAfterLocalChange(coordinating);
        await coordinating.synchronizeNow();

        expect(coordinating.limitRefusal$.get()).toEqual(refusing);
        expect(appState.getWorkspaces().map(workspace => workspace.id)).toContain(workspaceId);
        expect(snapshotReads).toBe(0);
        // The two debounced pushes send it once, and once more after re-reading the account's
        // lists - a refusal is usually a race for the last slot; the push-then-pull offers it
        // again, the same way. Never more.
        expect(pushes).toBe(4);
        expect(notices).toEqual([{ ...refusing, sequence: expect.any(Number) }]);
    });

    it("PROFILES: keeps the refused profile, and resumes once the account takes the push", async () => {
        const coordinating = await inStep();
        const second = await profiles.createProfile("Second");
        refusing = { kind: "FREE_PLAN", limit: "PROFILES", maximum: 1 };

        await coordinating.synchronizeNow();
        expect(coordinating.limitRefusal$.get()).toEqual(refusing);
        expect(profiles.getProfiles().map(profile => profile.id)).toContain(second!.id);
        expect(snapshotReads).toBe(0);

        // Upgraded on the website; the next push-then-pull goes through.
        refusing = null;
        await coordinating.synchronizeNow();
        expect(coordinating.limitRefusal$.get()).toBeNull();
        expect(snapshotReads).toBe(1);
    });
});

/**
 *  The account counts its installations; a sign-in that would be one too many on the free
 *  plan is refused. Nothing is stored, so the extension stays signed out and works locally,
 *  and the user is told both ways on: the devices page, or the upgrade.
 */
describe("signing in past the free plan's installations", () => {

    let sessions: SessionRepository;
    const devicesRefusal = {
        outcome: "rejected", status: 409, message: "Too many devices",
        limitRefusal: { kind: "FREE_PLAN", limit: "DEVICES", maximum: 5 }
    } as ApiResult<TokenPairDto>;

    beforeEach(async () => {
        await installationIdentity.init();
        sessions = new SessionRepository();
        await sessions.init();
        dialogs.shown.length = 0;
        dialogs.answer = "ok";
        vi.mocked(chrome.tabs.create).mockClear();
    });

    function viewModel(): SyncAccountViewModel {
        const apiClient = {
            logInWithPassword: () => Promise.resolve(devicesRefusal),
            redeemConnectCode: () => Promise.resolve(devicesRefusal)
        };
        const standing = new AccountStandingRepository(
            { getMyAccount: () => Promise.reject(new Error("not asked")) }, sessions);
        return new SyncAccountViewModel(apiClient as never, sessions, standing);
    }

    /** The dialog is opened without being awaited by the sign-in; let it settle. */
    const settle = () => new Promise(resolve => setTimeout(resolve, 0));

    it.each([
        ["a password sign-in", (model: SyncAccountViewModel) => model.logIn("kovo", "secret")],
        ["a pairing code", (model: SyncAccountViewModel) => model.connectWithCode("ABCD-1234")]
    ])("refused on %s: stays signed out and offers the devices page and the upgrade", async (_, signIn) => {
        const model = viewModel();
        // Not a failure for the sign-in dialog to show: it closes, and the way out follows.
        expect(await signIn(model)).toBeNull();
        expect(dialogs.shown).toHaveLength(0);

        await model.finishSignIn();
        await settle();

        expect(sessions.getSession()).toBeNull();
        expect(dialogs.shown).toHaveLength(1);
        expect(dialogs.shown[0].message).toContain("5 synchronised installations on the free plan");
        expect(dialogs.shown[0].values).toEqual(["devices", "upgrade", "ok"]);
    });

    it("opens the website's devices page when asked to", async () => {
        dialogs.answer = "devices";

        const model = viewModel();
        await model.logIn("kovo", "secret");
        await model.finishSignIn();
        await settle();

        expect(chrome.tabs.create).toHaveBeenCalledWith({ url: expect.stringMatching(/\/devices$/) });
    });

    it("opens the upgrade page when asked to", async () => {
        dialogs.answer = "upgrade";

        const model = viewModel();
        await model.connectWithCode("ABCD-1234");
        await model.finishSignIn();
        await settle();

        expect(chrome.tabs.create).toHaveBeenCalledWith({ url: expect.stringMatching(/\/account$/) });
    });
});
