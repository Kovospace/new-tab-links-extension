import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiResult, UserDeviceDto } from "../../../src/backend/sync/BackendApiClient";
import { DeviceNameReconciler } from "../../../src/backend/sync/DeviceNameReconciler";
import { SessionRepository } from "../../../src/backend/sync/SessionRepository";

const THIS_DEVICE = "0199aaaa-0000-7000-8000-00000000000a";
const OTHER_DEVICE = "0199bbbb-0000-7000-8000-00000000000b";

function device(id: string, deviceName: string, signedIn: boolean): UserDeviceDto {
    return {
        id, deviceName, browserName: "Chrome", signedIn,
        lastUsedAt: "2026-01-01T00:00:00Z"
    };
}

describe("DeviceNameReconciler", () => {

    let sessions: SessionRepository;
    let listDevices: ReturnType<typeof vi.fn>;
    let apiClient: { listDevices: unknown; renameDevice: unknown; takeOverDevice: unknown };
    let reconciler: DeviceNameReconciler;

    const listing = (...devices: UserDeviceDto[]): ApiResult<UserDeviceDto[]> =>
        ({ outcome: "success", data: devices });

    beforeEach(async () => {
        sessions = new SessionRepository();
        await sessions.init();
        await sessions.storeTokenPair({
            accessToken: "a", accessTokenExpiresInSeconds: 900, refreshToken: "r",
            userId: "owner", username: "kovo", deviceId: THIS_DEVICE
        });

        listDevices = vi.fn();
        apiClient = {
            listDevices,
            renameDevice: vi.fn(() => Promise.resolve({ outcome: "success", data: undefined })),
            takeOverDevice: vi.fn(() => Promise.resolve({ outcome: "success", data: undefined }))
        };
        reconciler = new DeviceNameReconciler(apiClient as never, sessions);
    });

    it("does nothing when the user chose no name", async () => {
        expect(await reconciler.assess(null)).toEqual({ kind: "settled" });
        expect(listDevices).not.toHaveBeenCalled();
    });

    it("does nothing when the chosen name is not in use", async () => {
        listDevices.mockResolvedValue(listing(
            device(THIS_DEVICE, "Work laptop", true),
            device(OTHER_DEVICE, "Home desktop", true)));

        expect(await reconciler.assess("Work laptop")).toEqual({ kind: "settled" });
    });

    it("never mistakes this device's own row for a clash", async () => {
        // The row was created moments ago carrying exactly the name being checked, so without
        // excluding it every chosen name would look taken by itself.
        listDevices.mockResolvedValue(listing(device(THIS_DEVICE, "Work laptop", true)));

        expect(await reconciler.assess("Work laptop")).toEqual({ kind: "settled" });
    });

    it("reports a signed-in namesake as taken, which is the only case worth asking about", async () => {
        const other = device(OTHER_DEVICE, "Work laptop", true);
        listDevices.mockResolvedValue(listing(device(THIS_DEVICE, "Work laptop", true), other));

        expect(await reconciler.assess("Work laptop")).toEqual({ kind: "taken", by: other });
    });

    it("reports a signed-out namesake as the same place returning", async () => {
        const other = device(OTHER_DEVICE, "Work laptop", false);
        listDevices.mockResolvedValue(listing(device(THIS_DEVICE, "Work laptop", true), other));

        expect(await reconciler.assess("Work laptop")).toEqual({ kind: "returning", to: other });
    });

    it("compares names the way a person would", async () => {
        const other = device(OTHER_DEVICE, "  work LAPTOP ", true);
        listDevices.mockResolvedValue(listing(other));

        expect(await reconciler.assess("Work laptop")).toEqual({ kind: "taken", by: other });
    });

    it("leaves the user alone when the device list cannot be read", async () => {
        // A name is a convenience. An unreadable list is never a reason to interrupt a sign-in
        // that has otherwise succeeded.
        listDevices.mockResolvedValue({ outcome: "offline", message: "no network" });

        expect(await reconciler.assess("Work laptop")).toEqual({ kind: "settled" });
    });

    it("does nothing when the backend did not say which row this device is", async () => {
        await sessions.clear();
        await sessions.storeTokenPair({
            accessToken: "a", accessTokenExpiresInSeconds: 900, refreshToken: "r",
            userId: "owner", username: "kovo"
        });

        expect(await reconciler.assess("Work laptop")).toEqual({ kind: "settled" });
        expect(listDevices).not.toHaveBeenCalled();
    });

    it("remembers the row it moved to after a take-over", async () => {
        const other = device(OTHER_DEVICE, "Work laptop", false);

        expect(await reconciler.takeOver(other)).toBe(true);
        expect(sessions.getSession()?.deviceId).toBe(OTHER_DEVICE);
    });

    it("keeps the old row when a take-over is refused", async () => {
        apiClient.takeOverDevice = vi.fn(() =>
            Promise.resolve({ outcome: "offline", message: "no network" }));
        reconciler = new DeviceNameReconciler(apiClient as never, sessions);

        expect(await reconciler.takeOver(device(OTHER_DEVICE, "Work laptop", false))).toBe(false);
        expect(sessions.getSession()?.deviceId).toBe(THIS_DEVICE);
    });
});
