import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BackendApiClient } from "../../../src/backend/sync/BackendApiClient";
import {
    SESSION_KEY, SessionRepository, SyncSession, TokenPairDto
} from "../../../src/backend/sync/SessionRepository";
import {
    readFakeStorage, seedFakeStorage
} from "../../support/chromeStorageStub";

/**
 *  A backend that rotates refresh tokens the way the real one does: each refresh revokes the
 *  token presented and issues the next pair, and a spent token is refused with a 401.
 *
 *  `accessExpired` makes the current access token refused until the next refresh, which is
 *  the ordinary reason a refresh happens. `refreshOutage` stands in for the ingress answering on the backend's behalf while a new
 *  version rolls out - the refresh endpoint is unreachable, not the token invalid.
 */
let generation: number;
let refreshCalls: number;
let refreshOutage: number | null;
let accessExpired: boolean;

const accessToken = (n: number) => `access-${n}`;
const refreshToken = (n: number) => `refresh-${n}`;

function json(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status });
}

async function fakeBackend(url: string, init: RequestInit): Promise<Response> {

    if (url.endsWith("/api/v1/auth/refresh")) {
        refreshCalls++;
        if (refreshOutage !== null) {
            return new Response("", { status: refreshOutage });
        }
        const presented = (JSON.parse(init.body as string) as { refreshToken: string }).refreshToken;
        if (presented !== refreshToken(generation)) {
            return json(401, { message: "Refresh token revoked" });
        }
        generation++;
        accessExpired = false;
        const pair: TokenPairDto = {
            accessToken: accessToken(generation), accessTokenExpiresInSeconds: 900,
            refreshToken: refreshToken(generation), userId: "u1", username: "someone"
        };
        return json(200, pair);
    }

    const bearer = (init.headers as Record<string, string>)["Authorization"];
    return !accessExpired && bearer === `Bearer ${accessToken(generation)}`
        ? json(200, { id: "u1", premium: false })
        : json(401, { message: "Access token expired" });
}

/** A session holding the first pair, as a page would have loaded it at startup. */
function storedSession(): SyncSession {
    return {
        accessToken: accessToken(1), refreshToken: refreshToken(1), userId: "u1",
        username: "someone", deviceId: null, accessTokenExpiresAt: 0
    };
}

/** One open new tab page: its own session repository and client, over the shared storage. */
async function openPage(): Promise<{ sessions: SessionRepository; client: BackendApiClient }> {
    const sessions = new SessionRepository();
    await sessions.init();
    return { sessions, client: new BackendApiClient(sessions) };
}

beforeEach(() => {
    generation = 1;
    refreshCalls = 0;
    refreshOutage = null;
    accessExpired = true;
    seedFakeStorage(SESSION_KEY, storedSession());
    vi.stubGlobal("fetch", vi.fn((url: string, init: RequestInit) => fakeBackend(url, init)));
});

afterEach(() => vi.unstubAllGlobals());

describe("BackendApiClient token refresh", () => {

    it("refreshes an expired access token and repeats the call", async () => {
        const { sessions, client } = await openPage();

        const result = await client.getMyAccount();

        expect(result.outcome).toBe("success");
        expect(sessions.getSession()?.refreshToken).toBe(refreshToken(2));
    });

    /** A deploy: the access token expires while the ingress has nothing behind it. */
    it.each([502, 503, 504, 500, 429])(
        "keeps the session when the refresh answers %i, and reports offline",
        async status => {
            const { sessions, client } = await openPage();
            refreshOutage = status;

            const result = await client.getMyAccount();

            expect(result.outcome).toBe("offline");
            expect(sessions.getSession()?.refreshToken).toBe(refreshToken(1));
            expect(readFakeStorage<SyncSession>(SESSION_KEY)?.refreshToken).toBe(refreshToken(1));
        });

    it("ends the session when the refresh token itself is refused", async () => {
        const { sessions, client } = await openPage();
        generation = 5; // refresh-1 is long spent

        const result = await client.getMyAccount();

        expect(result.outcome).toBe("rejected");
        expect(sessions.getSession()).toBeNull();
        expect(readFakeStorage(SESSION_KEY)).toBeNull();
    });

    /**
     *  Two new tab pages, both holding the first pair, both finding the access token expired
     *  at once. Before the refresh was shared, both spent refresh-1; the backend honoured the
     *  first and refused the second, and the second page signed every page out.
     */
    it("lets a second page use the pair the first one obtained instead of spending it again",
        async () => {
            const first = await openPage();
            const second = await openPage();

            const [firstResult, secondResult] = await Promise.all([
                first.client.getMyAccount(),
                second.client.getMyAccount()
            ]);

            expect(firstResult.outcome).toBe("success");
            expect(secondResult.outcome).toBe("success");
            expect(refreshCalls).toBe(1);
            expect(readFakeStorage<SyncSession>(SESSION_KEY)?.refreshToken).toBe(refreshToken(2));
        });
});
