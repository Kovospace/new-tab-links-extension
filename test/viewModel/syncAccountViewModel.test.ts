import { beforeEach, describe, expect, it, vi } from "vitest";

const notices = vi.hoisted(() => ({ shown: [] as string[] }));

vi.mock("../../src/ui/partials/confirmations", () => ({
    showNotice: (_title: string, message: string) => {
        notices.shown.push(message);
        return Promise.resolve();
    }
}));

import { ApiResult } from "../../src/backend/sync/BackendApiClient";
import { installationIdentity } from "../../src/backend/sync/InstallationIdentity";
import { SessionRepository, TokenPairDto } from "../../src/backend/sync/SessionRepository";
import { AccountStandingRepository } from "../../src/backend/sync/AccountStandingRepository";
import { SyncAccountViewModel } from "../../src/viewModel/syncAccountViewModel";

/**
 *  A wrong password used to be said in a notice of its own, after the dialog it was typed into
 *  had closed - and the user went back to the menu and typed everything again (#82). The
 *  failure is now handed back, for the dialog to show while it stays open.
 */
describe("SyncAccountViewModel signing in", () => {

    let sessions: SessionRepository;
    let answer: ApiResult<TokenPairDto>;

    beforeEach(async () => {
        await installationIdentity.init();
        sessions = new SessionRepository();
        await sessions.init();
        notices.shown.length = 0;
        answer = { outcome: "rejected", status: 401, message: "Wrong username or password" };
    });

    function viewModel(): SyncAccountViewModel {
        const apiClient = {
            logInWithPassword: () => Promise.resolve(answer),
            redeemConnectCode: () => Promise.resolve(answer)
        };
        const standing = new AccountStandingRepository(
            { getMyAccount: () => Promise.reject(new Error("not asked")) }, sessions);
        return new SyncAccountViewModel(apiClient as never, sessions, standing);
    }

    it.each([
        ["a password", (model: SyncAccountViewModel) => model.logIn("kovo", "wrong")],
        ["a connect code", (model: SyncAccountViewModel) => model.connectWithCode("ABCD-0000")]
    ])("hands back a refused sign-in with %s instead of announcing it", async (_, signIn) => {
        const problem = await signIn(viewModel());

        expect(problem).toContain("Wrong username or password");
        expect(notices.shown).toEqual([]);
        expect(sessions.getSession()).toBeNull();
    });

    it("hands back missing credentials the same way", async () => {
        expect(await viewModel().logIn("kovo", "")).toBeTruthy();
        expect(notices.shown).toEqual([]);
    });
});
