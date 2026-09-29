import { beforeEach, describe, expect, it } from "vitest";

import {
    SESSION_KEY, SessionRepository, SyncSession
} from "../../../src/backend/sync/SessionRepository";
import { flushStorageNotifications, seedFakeStorage } from "../../support/chromeStorageStub";

/**
 *  Every open new tab page has a SessionRepository of its own over the one storage. The refresh
 *  token is single use, so a page that goes on holding the pair another page has replaced will
 *  spend a revoked token on its next refresh - these pin that each page takes the others' writes.
 */

const accessToken = (n: number) => `access-${n}`;
const refreshToken = (n: number) => `refresh-${n}`;

/** One open new tab page, loaded from the shared storage. */
async function openPage(): Promise<{ sessions: SessionRepository }> {
    const sessions = new SessionRepository();
    await sessions.init();
    return { sessions };
}

beforeEach(() => {
    const stored: SyncSession = {
        accessToken: accessToken(1), refreshToken: refreshToken(1), userId: "u1",
        username: "someone", deviceId: null, accessTokenExpiresAt: 0
    };
    seedFakeStorage(SESSION_KEY, stored);
});

describe("SessionRepository across pages", () => {

    it("adopts a pair another page stored", async () => {
        const first = await openPage();
        const second = await openPage();

        await first.sessions.storeTokenPair({
            accessToken: accessToken(2), accessTokenExpiresInSeconds: 900,
            refreshToken: refreshToken(2), userId: "u1", username: "someone"
        });
        await flushStorageNotifications();

        expect(second.sessions.getSession()?.refreshToken).toBe(refreshToken(2));
    });

    it("adopts a sign-out made in another page", async () => {
        const first = await openPage();
        const second = await openPage();

        await first.sessions.clear();
        await flushStorageNotifications();

        expect(second.sessions.getSession()).toBeNull();
        expect(second.sessions.session$.get()).toBeNull();
    });
});
