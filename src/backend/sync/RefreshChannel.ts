import { buildWebsocketUrl } from "./SyncConfiguration";
import { ObservableValue } from "../../utils/observableValue";
import { Logger } from "../../utils/logger";

/**
 *  What the backend pushes when the account's data has changed somewhere else.
 *
 *  It deliberately carries no data of its own: it says only "you are out of date", and the
 *  client then pulls a snapshot when it is ready to. `origin` names the device that caused
 *  the change, so a device can recognise and ignore the echo of its own push.
 */
export interface DataChangedNotification {
    changedAt: string;
    origin: string | null;
}

/** Told when a change lands. */
export type RefreshListener = (notification: DataChangedNotification) => void;

/** Told when a dropped session has been re-established, as opposed to opened the first time. */
export type ReconnectListener = () => void;

/** Asked for the access token to authenticate with, each time a connection is opened. */
export type AccessTokenProvider = () => string | null;

const STOMP_NULL = "\u0000";
const SUBSCRIPTION_ID = "refresh-0";
const REFRESH_DESTINATION = "/user/queue/refresh";

/** How long the two ends promise to speak up, in milliseconds. */
const HEARTBEAT_INTERVAL = 20_000;

const FIRST_RECONNECT_DELAY = 1_000;
const LONGEST_RECONNECT_DELAY = 60_000;

/**
 *  The extension's ear on the backend: a minimal STOMP client over a native WebSocket.
 *
 *  The backend speaks STOMP over a raw WebSocket (no SockJS) and delivers to a per-user
 *  destination, so what is needed here is one CONNECT, one SUBSCRIBE, and the ability to
 *  read a MESSAGE frame. That is a few dozen lines of framing, which is why this is written
 *  out rather than pulled in - the repository has exactly one runtime dependency and this is
 *  not worth being the second.
 *
 *  **Authentication happens on the CONNECT frame, not the handshake**, because a browser
 *  cannot set headers on a WebSocket upgrade. The backend permits the handshake itself and
 *  refuses the CONNECT without a valid bearer token.
 *
 *  This lives in the page, not the service worker: MV3 stops an idle worker after thirty
 *  seconds, and a channel that is silent by design is exactly what that kills.
 */
export class RefreshChannel {

    private LOG: Logger = new Logger("RefreshChannel");

    private readonly accessTokenProvider: AccessTokenProvider;
    private readonly listeners: Set<RefreshListener> = new Set();
    private readonly reconnectListeners: Set<ReconnectListener> = new Set();

    private socket: WebSocket | null = null;
    private heartbeatTimer: number | null = null;
    private reconnectTimer: number | null = null;
    private reconnectDelay: number = FIRST_RECONNECT_DELAY;

    /** True while a STOMP session is established, not merely while a socket is open. */
    public readonly connected$ = new ObservableValue<boolean>(false);

    /** Set once disconnect() is called, so a deliberate close does not reconnect. */
    private closedDeliberately: boolean = false;

    /**
     *  Whether a STOMP session has been established since the channel was last opened on
     *  purpose. What tells a reconnection from a first connection; disconnect() resets it,
     *  because opening again after that is a fresh start whose caller pulls anyway.
     */
    private hasBeenConnected: boolean = false;

    /**
     *  @param accessTokenProvider  consulted on every connection attempt, so a reconnection
     *                              after a token refresh uses the new token rather than the
     *                              one that was current when the channel was first opened.
     */
    constructor(accessTokenProvider: AccessTokenProvider) {
        this.accessTokenProvider = accessTokenProvider;
    }

    /** Registers a listener; returns the function that removes it again. */
    public onRefresh(listener: RefreshListener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /**
     *  Registers a listener for re-established sessions; returns the function that removes it.
     *
     *  A notification is sent once and never replayed. Anything the account announced while
     *  this channel was down - a pod replaced during a deploy, a laptop waking up, a network
     *  blip - was announced to nobody, so the reconnection itself is the only sign that
     *  something may have been missed.
     */
    public onReconnected(listener: ReconnectListener): () => void {
        this.reconnectListeners.add(listener);
        return () => this.reconnectListeners.delete(listener);
    }

    /**
     *  Opens the channel, and keeps it open: a dropped connection is retried with a widening
     *  delay until disconnect() is called. Doing this while already connected does nothing.
     */
    public connect(): void {
        this.closedDeliberately = false;

        if (this.socket && this.socket.readyState <= WebSocket.OPEN) {
            return;
        }
        const accessToken = this.accessTokenProvider();
        if (!accessToken) {
            this.LOG.debug("connect", "No access token; staying closed");
            return;
        }
        this.openSocket(accessToken);
    }

    /** Closes the channel and stops reconnecting. Safe to call when already closed. */
    public disconnect(): void {
        this.closedDeliberately = true;
        this.hasBeenConnected = false;
        this.clearTimers();

        if (this.socket) {
            this.socket.onclose = null;
            this.socket.close();
            this.socket = null;
        }
        this.connected$.set(false);
    }

    // ------------------------------------------------------------------- socket

    private openSocket(accessToken: string): void {

        const url = buildWebsocketUrl();
        this.LOG.debug("openSocket", url);

        const socket = new WebSocket(url);
        this.socket = socket;

        socket.onopen = () => this.sendConnectFrame(socket, accessToken);
        socket.onmessage = (event: MessageEvent) => this.receive(String(event.data));

        socket.onerror = () => this.LOG.debug("openSocket", "Websocket reported an error");

        socket.onclose = () => {
            this.LOG.debug("openSocket", "Websocket closed");
            this.connected$.set(false);
            this.clearTimers();
            this.scheduleReconnect();
        };
    }

    /**
     *  Waits, then tries again, doubling the wait each time up to a minute.
     *
     *  Being offline is an ordinary state for a browser extension, not an error, so this is
     *  quiet about it - the user is never told, and nothing they do is blocked meanwhile.
     */
    private scheduleReconnect(): void {
        if (this.closedDeliberately || this.reconnectTimer !== null) {
            return;
        }
        const delay = this.reconnectDelay;
        this.reconnectDelay = Math.min(delay * 2, LONGEST_RECONNECT_DELAY);

        this.reconnectTimer = window.setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, delay);
    }

    private clearTimers(): void {
        if (this.heartbeatTimer !== null) {
            window.clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
        if (this.reconnectTimer !== null) {
            window.clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    // -------------------------------------------------------------------- STOMP

    private sendConnectFrame(socket: WebSocket, accessToken: string): void {
        // Not escaped: STOMP 1.2 exempts CONNECT and CONNECTED from header escaping, for
        // compatibility with 1.0. Escaping here would turn a development "host:8080" into
        // "host\\c8080" and the server would refuse the frame.
        socket.send(this.buildFrame("CONNECT", {
            "accept-version": "1.2",
            "host": new URL(buildWebsocketUrl()).host,
            "heart-beat": `${HEARTBEAT_INTERVAL},${HEARTBEAT_INTERVAL}`,
            "Authorization": `Bearer ${accessToken}`
        }, false));
    }

    private sendSubscribeFrame(socket: WebSocket): void {
        socket.send(this.buildFrame("SUBSCRIBE", {
            "id": SUBSCRIPTION_ID,
            "destination": REFRESH_DESTINATION,
            "ack": "auto"
        }));
    }

    /** Reads one inbound frame and reacts to the three commands that matter. */
    private receive(payload: string): void {

        // A lone newline is a heartbeat, not a frame.
        if (payload === "\n" || payload === "\r\n") {
            return;
        }
        const frame = this.parseFrame(payload);

        switch (frame.command) {
            case "CONNECTED":
                this.LOG.debug("receive", "STOMP session established");
                this.reconnectDelay = FIRST_RECONNECT_DELAY;
                this.connected$.set(true);
                if (this.socket) {
                    this.sendSubscribeFrame(this.socket);
                    this.startHeartbeat(this.socket);
                }
                if (this.hasBeenConnected) {
                    this.reconnectListeners.forEach(listener => listener());
                }
                this.hasBeenConnected = true;
                return;

            case "MESSAGE":
                this.publish(frame.body);
                return;

            case "ERROR":
                // The usual cause is an expired token. Closing lets the reconnect ask the
                // provider again, by which time a refresh may have produced a fresh one.
                this.LOG.warn("receive", `STOMP error: ${frame.headers["message"] ?? "unknown"}`);
                this.connected$.set(false);
                this.socket?.close();
                return;

            default:
                this.LOG.debug("receive", `Ignoring ${frame.command}`);
        }
    }

    /** Tells every listener that the account changed elsewhere. */
    private publish(body: string): void {
        let notification: DataChangedNotification;
        try {
            notification = JSON.parse(body) as DataChangedNotification;
        } catch {
            this.LOG.warn("publish", "Refresh notification was not readable JSON");
            return;
        }
        this.listeners.forEach(listener => listener(notification));
    }

    /**
     *  Sends the newline the server expects while nothing else is going on.
     *
     *  Without it the server takes the connection for dead and drops it, and any proxy in
     *  between is liable to do the same.
     */
    private startHeartbeat(socket: WebSocket): void {
        this.heartbeatTimer = window.setInterval(() => {
            if (socket.readyState === WebSocket.OPEN) {
                socket.send("\n");
            }
        }, HEARTBEAT_INTERVAL);
    }

    // ------------------------------------------------------------------ framing

    /**
     *  COMMAND, headers, a blank line, an empty body, and a NUL.
     *
     *  @param escapeHeaders  false only for CONNECT, which STOMP 1.2 exempts from escaping.
     */
    private buildFrame(
        command: string,
        headers: Record<string, string>,
        escapeHeaders: boolean = true
    ): string {
        const lines = Object.entries(headers)
            .map(([name, value]) =>
                `${name}:${escapeHeaders ? this.escapeHeaderValue(value) : value}`);

        return `${command}\n${lines.join("\n")}\n\n${STOMP_NULL}`;
    }

    private parseFrame(payload: string): { command: string; headers: Record<string, string>; body: string } {

        const withoutTerminator = payload.endsWith(STOMP_NULL) ? payload.slice(0, -1) : payload;
        const headerBoundary = withoutTerminator.indexOf("\n\n");

        const head = headerBoundary === -1
            ? withoutTerminator
            : withoutTerminator.slice(0, headerBoundary);
        const body = headerBoundary === -1
            ? ""
            : withoutTerminator.slice(headerBoundary + 2);

        const [command, ...headerLines] = head.split("\n");
        const headers: Record<string, string> = {};

        for (const line of headerLines) {
            const separator = line.indexOf(":");
            if (separator === -1) {
                continue;
            }
            const name = line.slice(0, separator);
            // Repeated headers keep the first value, as STOMP 1.2 requires.
            if (!(name in headers)) {
                headers[name] = this.unescapeHeaderValue(line.slice(separator + 1));
            }
        }
        return { command: command.trim(), headers, body };
    }

    /** STOMP 1.2 reserves these four characters inside a header value. */
    private escapeHeaderValue(value: string): string {
        return value
            .replace(/\\/g, "\\\\")
            .replace(/\r/g, "\\r")
            .replace(/\n/g, "\\n")
            .replace(/:/g, "\\c");
    }

    private unescapeHeaderValue(value: string): string {
        return value
            .replace(/\\c/g, ":")
            .replace(/\\n/g, "\n")
            .replace(/\\r/g, "\r")
            .replace(/\\\\/g, "\\");
    }
}
