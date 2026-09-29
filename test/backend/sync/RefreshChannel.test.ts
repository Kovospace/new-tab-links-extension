import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RefreshChannel } from "../../../src/backend/sync/RefreshChannel";
import { FakeWebSocket } from "../../support/fakeWebSocket";

/** Longer than the channel's first reconnection delay (one second). */
const RECONNECT_WAIT = { timeout: 3_000 };

describe("RefreshChannel reconnection", () => {

    let channel: RefreshChannel;
    let reconnections: number;

    beforeEach(() => {
        FakeWebSocket.reset();
        vi.stubGlobal("WebSocket", FakeWebSocket);
        channel = new RefreshChannel(() => "access-token");
        reconnections = 0;
        channel.onReconnected(() => reconnections++);
    });

    afterEach(() => {
        channel.disconnect();
        vi.unstubAllGlobals();
    });

    it("does not call the first session a reconnection", () => {
        channel.connect();
        FakeWebSocket.latest().acceptStompSession();

        expect(channel.connected$.get()).toBe(true);
        expect(reconnections).toBe(0);
    });

    it("says so once a session the server dropped is established again", async () => {
        channel.connect();
        FakeWebSocket.latest().acceptStompSession();

        FakeWebSocket.latest().dropFromServer();
        await vi.waitFor(() => expect(FakeWebSocket.opened).toHaveLength(2), RECONNECT_WAIT);
        FakeWebSocket.latest().acceptStompSession();

        expect(reconnections).toBe(1);
    });

    it("treats opening again after a deliberate disconnect as a fresh start", () => {
        channel.connect();
        FakeWebSocket.latest().acceptStompSession();

        channel.disconnect();
        channel.connect();
        FakeWebSocket.latest().acceptStompSession();

        expect(reconnections).toBe(0);
    });
});
