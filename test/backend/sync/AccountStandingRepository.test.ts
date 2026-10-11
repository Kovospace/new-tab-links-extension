import { beforeEach, describe, expect, it } from "vitest";

import {
    AccountStanding, AccountStandingRepository, BLOCKED_GRACE_MS, STANDING_MAX_AGE_MS,
    UNREACHABLE_GRACE_MS
} from "../../../src/backend/sync/AccountStandingRepository";
import { Unreachability } from "../../../src/backend/sync/ReachabilityProbe";
import { defaultPlanLimits } from "../../../src/backend/entity/PlanLimits";
import { ApiResult, MyAccountDto } from "../../../src/backend/sync/BackendApiClient";
import { SyncSession } from "../../../src/backend/sync/SessionRepository";
import { ACCOUNT_STANDING_KEY } from "../../../src/backend/datasource/chromeStorage/storageKeys";
import { ObservableValue } from "../../../src/utils/observableValue";
import { readFakeStorage, seedFakeStorage } from "../../support/chromeStorageStub";

const MINUTE = 60 * 1000;

function session(userId: string): SyncSession {
    return {
        accessToken: "a", refreshToken: "r", userId, username: userId,
        deviceId: null, accessTokenExpiresAt: Number.MAX_SAFE_INTEGER
    };
}

/** The account as the server would answer, and a record of how often it was asked. */
let answer: ApiResult<MyAccountDto>;
let asked: number;
let clock: number;
let session$: ObservableValue<SyncSession | null>;
/** What the reachability probe finds, and how often it was sent. */
let diagnosis: Unreachability;
let probed: number;

function repository(): AccountStandingRepository {
    return new AccountStandingRepository(
        { getMyAccount: async () => { asked++; return answer; } },
        { session$, getSession: () => session$.get() },
        () => clock,
        new ObservableValue<boolean>(false),
        new ObservableValue(defaultPlanLimits(false)),
        { diagnose: async () => { probed++; return diagnosis; } }
    );
}

const premium = (value: boolean): ApiResult<MyAccountDto> =>
    ({ outcome: "success", data: { id: "u1", premium: value } });

/** Lets the background request started by init() or a session change finish. */
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
    answer = premium(false);
    asked = 0;
    clock = 1_000_000_000;
    session$ = new ObservableValue<SyncSession | null>(null);
    diagnosis = "offline";
    probed = 0;
});

describe("AccountStandingRepository", () => {

    it("is not premium, and asks nobody, while signed out", async () => {
        const standing = repository();
        await standing.init();
        await settle();

        expect(standing.premium$.get()).toBe(false);
        expect(asked).toBe(0);
    });

    /** The reason it is remembered: no advertisement flashes on a premium user's new tab. */
    it("is premium from the first frame when that was last known for this account", async () => {
        session$.set(session("u1"));
        seedFakeStorage(ACCOUNT_STANDING_KEY,
            { userId: "u1", premium: true, checkedAt: clock - MINUTE } satisfies AccountStanding);
        answer = { outcome: "offline", message: "" };

        const standing = repository();
        await standing.init();

        expect(standing.premium$.get()).toBe(true);
        await settle();
        expect(asked).toBe(0);
    });

    it("asks again once the last answer is old enough, and takes the new one", async () => {
        session$.set(session("u1"));
        seedFakeStorage(ACCOUNT_STANDING_KEY,
            { userId: "u1", premium: true, checkedAt: clock - STANDING_MAX_AGE_MS } satisfies AccountStanding);
        answer = premium(false); // the subscription ran out

        const standing = repository();
        await standing.init();
        await settle();

        expect(asked).toBe(1);
        expect(standing.premium$.get()).toBe(false);
        expect(readFakeStorage<AccountStanding>(ACCOUNT_STANDING_KEY)).toEqual(
            { userId: "u1", premium: false, checkedAt: clock });
    });

    it("stays as it was when the account cannot be reached", async () => {
        session$.set(session("u1"));
        seedFakeStorage(ACCOUNT_STANDING_KEY,
            { userId: "u1", premium: true, checkedAt: 0 } satisfies AccountStanding);
        answer = { outcome: "offline", message: "offline" };

        const standing = repository();
        await standing.init();
        await settle();

        expect(asked).toBe(1);
        expect(standing.premium$.get()).toBe(true);
    });

    /** One account's purchase is never shown on another account's page. */
    it("does not carry another account's answer over, and asks about the new one", async () => {
        session$.set(session("u2"));
        seedFakeStorage(ACCOUNT_STANDING_KEY,
            { userId: "u1", premium: true, checkedAt: clock } satisfies AccountStanding);
        answer = premium(false);

        const standing = repository();
        await standing.init();

        expect(standing.premium$.get()).toBe(false);
        await settle();
        expect(asked).toBe(1);
    });

    it("finds out on signing in, and forgets on signing out", async () => {
        answer = premium(true);
        const standing = repository();
        await standing.init();

        session$.set(session("u1"));
        await settle();
        expect(standing.premium$.get()).toBe(true);

        session$.set(null);
        await settle();
        expect(standing.premium$.get()).toBe(false);
        expect(readFakeStorage(ACCOUNT_STANDING_KEY)).toBeNull();
    });

    it("does not ask again for fresh tokens on the same account", async () => {
        answer = premium(true);
        const standing = repository();
        await standing.init();
        session$.set(session("u1"));
        await settle();

        session$.set({ ...session("u1"), accessToken: "renewed" });
        await settle();

        expect(asked).toBe(1);
    });

    /** Whoever goes to buy premium comes back to a tab that should find out, not trust old news. */
    it("asks at the next chance after being marked stale", async () => {
        session$.set(session("u1"));
        seedFakeStorage(ACCOUNT_STANDING_KEY,
            { userId: "u1", premium: false, checkedAt: clock } satisfies AccountStanding);

        const standing = repository();
        await standing.init();
        await standing.markStale();

        answer = premium(true);
        const nextTab = repository();
        await nextTab.init();
        await settle();

        expect(nextTab.premium$.get()).toBe(true);
    });

    /**
     *  The console forgery: `premium: true` dated in the future. An age below zero is never
     *  "old enough", so the account was never asked again.
     */
    it("asks again about an answer dated in the future", async () => {
        session$.set(session("u1"));
        seedFakeStorage(ACCOUNT_STANDING_KEY,
            { userId: "u1", premium: true, checkedAt: clock + 365 * 24 * 60 * MINUTE } satisfies AccountStanding);
        answer = premium(false);

        const standing = repository();
        await standing.init();
        await settle();

        expect(asked).toBe(1);
        expect(standing.premium$.get()).toBe(false);
    });

    /** A page left open for days - a pinned tab - with nothing else asking. */
    it("asks again from a poll once the answer it holds grows stale", async () => {
        session$.set(session("u1"));
        answer = premium(true);
        const standing = repository();
        await standing.init();
        await settle();
        expect(asked).toBe(1);

        clock += STANDING_MAX_AGE_MS - MINUTE;
        await standing.poll();
        expect(asked).toBe(1);

        answer = premium(false);
        clock += 2 * MINUTE;
        await standing.poll();
        expect(asked).toBe(2);
        expect(standing.premium$.get()).toBe(false);
    });

    it("takes the answer another page stored instead of asking itself", async () => {
        session$.set(session("u1"));
        answer = premium(false);
        const standing = repository();
        await standing.init();
        await settle();

        clock += STANDING_MAX_AGE_MS;
        seedFakeStorage(ACCOUNT_STANDING_KEY,
            { userId: "u1", premium: true, checkedAt: clock } satisfies AccountStanding);
        await standing.poll();

        expect(asked).toBe(1);
        expect(standing.premium$.get()).toBe(true);
    });

    describe("when the account does not answer", () => {

        async function unconfirmedFor(duration: number): Promise<AccountStandingRepository> {
            session$.set(session("u1"));
            seedFakeStorage(ACCOUNT_STANDING_KEY,
                { userId: "u1", premium: true, checkedAt: clock - duration } satisfies AccountStanding);
            answer = { outcome: "offline", message: "offline" };
            const standing = repository();
            await standing.init();
            await settle();
            return standing;
        }

        /** Not punished for being away: corrected once online, never for being offline. */
        it("keeps premium for a browser that is plainly offline, however long", async () => {
            diagnosis = "offline";
            const standing = await unconfirmedFor(90 * 24 * 60 * MINUTE);

            expect(probed).toBe(1);
            expect(standing.premium$.get()).toBe(true);
        });

        it("sends no probe at all within a day of the last confirmation", async () => {
            diagnosis = "accountBlocked";
            const standing = await unconfirmedFor(BLOCKED_GRACE_MS - MINUTE);

            expect(probed).toBe(0);
            expect(standing.premium$.get()).toBe(true);
        });

        it("reads premium as free after a day while our own hosts answer", async () => {
            diagnosis = "accountBlocked";
            const standing = await unconfirmedFor(BLOCKED_GRACE_MS);

            expect(standing.premium$.get()).toBe(false);
            // The date of the last real answer stays, so the next chance still asks.
            expect(readFakeStorage<AccountStanding>(ACCOUNT_STANDING_KEY)).toEqual(
                { userId: "u1", premium: false, checkedAt: clock - BLOCKED_GRACE_MS });
        });

        it("gives a week when only the rest of the internet answers - our outage, or the domain blocked", async () => {
            diagnosis = "ourServersUnreachable";
            const withinAWeek = await unconfirmedFor(UNREACHABLE_GRACE_MS - MINUTE);
            expect(withinAWeek.premium$.get()).toBe(true);

            const pastAWeek = await unconfirmedFor(UNREACHABLE_GRACE_MS);
            expect(pastAWeek.premium$.get()).toBe(false);
        });

        it("is premium again the moment the account answers so", async () => {
            diagnosis = "accountBlocked";
            const standing = await unconfirmedFor(2 * BLOCKED_GRACE_MS);
            expect(standing.premium$.get()).toBe(false);

            answer = premium(true);
            await standing.poll();
            expect(standing.premium$.get()).toBe(true);
        });

        it("diagnoses at most once an hour", async () => {
            diagnosis = "offline";
            const standing = await unconfirmedFor(2 * BLOCKED_GRACE_MS);
            expect(probed).toBe(1);

            clock += STANDING_MAX_AGE_MS;
            await standing.poll();
            expect(asked).toBe(2);
            expect(probed).toBe(1);

            clock += 60 * MINUTE;
            await standing.poll();
            expect(probed).toBe(2);
        });
    });
});
