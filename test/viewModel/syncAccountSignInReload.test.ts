import { beforeEach, describe, expect, it, vi } from "vitest";

const dialog = vi.hoisted(() => ({
    asked: [] as string[],
    answer: null as null | ((value: string | null) => void),
    notices: [] as string[],
    read: null as null | (() => void)
}));

vi.mock("../../src/ui/partials/choiceDialog", () => ({
    ChoiceDialog: class {
        private readonly title: string;
        constructor(title: string) {
            this.title = title;
        }
        ask(): Promise<string | null> {
            dialog.asked.push(this.title);
            return new Promise(resolve => { dialog.answer = resolve; });
        }
    }
}));
vi.mock("../../src/ui/partials/confirmations", () => ({
    showNotice: (_title: string, message: string): Promise<void> => {
        dialog.notices.push(message);
        return new Promise(resolve => { dialog.read = resolve; });
    }
}));
vi.mock("../../src/backend/sync/ExampleDataRemoval", () => ({ removeUntouchedExamples: () => Promise.resolve() }));

import { ApiResult, UserDeviceDto } from "../../src/backend/sync/BackendApiClient";
import { installationIdentity } from "../../src/backend/sync/InstallationIdentity";
import { SessionRepository, TokenPairDto } from "../../src/backend/sync/SessionRepository";
import { AccountStandingRepository } from "../../src/backend/sync/AccountStandingRepository";
import { SyncAccountViewModel } from "../../src/viewModel/syncAccountViewModel";
import { PageReloads } from "../../src/utils/pageReload";

/**
 *  Signing in on a fresh install removes the untouched starter workspace, and the page reloads
 *  on a profile with no workspace. It did so while the "device name already in use" question
 *  that follows the sign-in was open, which closed it and left a duplicate name (#210).
 */
describe("SyncAccountViewModel holding page reloads while a sign-in finishes", () => {

    const NOW = "2026-11-16T10:00:00Z";
    let sessions: SessionRepository;
    let reload: ReturnType<typeof vi.fn>;
    let reloads: PageReloads;

    const tokens: TokenPairDto = {
        accessToken: "access", accessTokenExpiresInSeconds: 900, refreshToken: "refresh",
        userId: "user-1", username: "kovo", deviceId: "this-device"
    };
    let devices: UserDeviceDto[];
    const conflicting: UserDeviceDto[] = [
        { id: "this-device", deviceName: "Work laptop", browserName: "Chrome", lastUsedAt: NOW, firstSeenAt: NOW, signedIn: true },
        { id: "other-device", deviceName: "Work laptop", browserName: "Chrome", lastUsedAt: NOW, firstSeenAt: NOW, signedIn: true }
    ];

    beforeEach(async () => {
        await installationIdentity.init();
        sessions = new SessionRepository();
        await sessions.init();
        dialog.asked.length = 0;
        dialog.answer = null;
        dialog.notices.length = 0;
        dialog.read = null;
        devices = conflicting;
        reload = vi.fn();
        reloads = new PageReloads(reload);
    });

    function viewModel(): SyncAccountViewModel {
        const apiClient = {
            logInWithPassword: (): Promise<ApiResult<TokenPairDto>> =>
                Promise.resolve({ outcome: "success", data: tokens }),
            listDevices: (): Promise<ApiResult<UserDeviceDto[]>> =>
                Promise.resolve({ outcome: "success", data: devices }),
            takeOverDevice: (): Promise<ApiResult<void>> =>
                Promise.resolve({ outcome: "success", data: undefined })
        };
        const standing = new AccountStandingRepository(
            { getMyAccount: () => Promise.reject(new Error("not asked")) }, sessions);
        const devicePreferences = {
            syncEnabled$: { subscribe: () => undefined },
            setSyncEnabled: () => Promise.resolve()
        };
        return new SyncAccountViewModel(
            apiClient as never, sessions, standing, undefined, devicePreferences as never, reloads);
    }

    it("reloads only once the device name question has been answered", async () => {
        const model = viewModel();
        expect(await model.logIn("kovo", "secret", "Work laptop")).toBeNull();

        // The starter is gone and the page asks to be reloaded, while the dialog is still closing.
        reloads.request();
        const finishing = model.finishSignIn();
        await vi.waitFor(() => expect(dialog.asked).toHaveLength(1));
        expect(reload).not.toHaveBeenCalled();

        dialog.answer?.("keep");
        await finishing;
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it("lets the page reload at once after a sign-in with nothing to ask", async () => {
        const model = viewModel();
        expect(await model.logIn("kovo", "secret", "Unique name")).toBeNull();
        reloads.request();
        await model.finishSignIn();

        expect(dialog.asked).toEqual([]);
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it("reloads only once the user has read that a returning device was taken over", async () => {
        // A reinstall: the namesake is signed out and this installation's row is brand new.
        devices = [conflicting[0], { ...conflicting[1], signedIn: false }];
        const model = viewModel();
        expect(await model.logIn("kovo", "secret", "Work laptop")).toBeNull();

        reloads.request();
        const finishing = model.finishSignIn();
        await vi.waitFor(() => expect(dialog.notices).toHaveLength(1));
        expect(reload).not.toHaveBeenCalled();

        dialog.read?.();
        await finishing;
        expect(reload).toHaveBeenCalledTimes(1);
    });
});
