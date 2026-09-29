/**
 *  A WebSocket that goes nowhere, driven by the test instead of a server.
 *
 *  jsdom's own WebSocket would try to reach the backend. This one records what the client sends
 *  and lets a test play the server's part: accept the STOMP session, or drop the connection the
 *  way a replaced backend pod does. Installed with `vi.stubGlobal("WebSocket", FakeWebSocket)`.
 */
export class FakeWebSocket {

    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;

    /** Every socket opened since the last reset, oldest first. */
    static opened: FakeWebSocket[] = [];

    readonly url: string;
    readonly sent: string[] = [];
    readyState: number = FakeWebSocket.CONNECTING;

    onopen: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;

    constructor(url: string) {
        this.url = url;
        FakeWebSocket.opened.push(this);
    }

    static reset(): void {
        FakeWebSocket.opened = [];
    }

    /** The socket most recently opened, which is the one a test usually means. */
    static latest(): FakeWebSocket {
        const socket = FakeWebSocket.opened[FakeWebSocket.opened.length - 1];
        if (!socket) {
            throw new Error("No WebSocket has been opened");
        }
        return socket;
    }

    send(data: string): void {
        this.sent.push(data);
    }

    /** Closed by the client itself. */
    close(): void {
        this.readyState = FakeWebSocket.CLOSED;
        this.onclose?.();
    }

    /** Plays the server: the socket opens and the STOMP session is accepted. */
    acceptStompSession(): void {
        this.readyState = FakeWebSocket.OPEN;
        this.onopen?.();
        this.onmessage?.({ data: "CONNECTED\nversion:1.2\n\n\u0000" });
    }

    /** Plays the server going away: a pod replaced during a deploy, a network drop. */
    dropFromServer(): void {
        this.readyState = FakeWebSocket.CLOSED;
        this.onclose?.();
    }
}
