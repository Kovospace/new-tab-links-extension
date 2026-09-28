import { beforeEach, describe, expect, it } from "vitest";

import {
    AccountStanding, AccountStandingRepository, STANDING_MAX_AGE_MS
} from "../../../src/backend/sync/AccountStandingRepository";
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

function repository(): AccountStandingRepository {
    return new AccountStandingRepository(
        { getMyAccount: async () => { asked++; return answer; } },
        { session$, getSession: () => session$.get() },
        () => clock
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
});
