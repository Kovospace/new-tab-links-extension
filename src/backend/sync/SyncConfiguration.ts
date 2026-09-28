
/**
 *  Every environment dependent value the synchronisation with the backend needs.
 *
 *  LOCAL DEVELOPMENT
 *  -----------------
 *  Run the backend on your machine (see the backend repository's docker-compose or its
 *  .mirrord/README.md) and swap the two "apiBaseUrl"/"websiteBaseUrl" values below for
 *  LOCAL_API_BASE_URL / LOCAL_WEBSITE_BASE_URL, then rebuild with "npm run build" and
 *  reload the unpacked extension. Nothing else has to change: manifest.json already asks
 *  for "<all_urls>" host permissions, so both the deployed and the local origin are
 *  reachable, and the deployed backend already allows "chrome-extension://*" as a CORS
 *  origin, so an unmodified build talks to production out of the box.
 */

/** Public deployment of the backend API. */
const PRODUCTION_API_BASE_URL: string = "https://api.tabilinks.app";

/** Backend started locally, the port its Spring Boot application listens on by default. */
const LOCAL_API_BASE_URL: string = "http://localhost:8080";

/** Public deployment of the website (registration, account, connect codes). */
const PRODUCTION_WEBSITE_BASE_URL: string = "https://tabilinks.app";

/** Website dev server, which runs on 5173 rather than Angular's default 4200. */
const LOCAL_WEBSITE_BASE_URL: string = "http://localhost:5173";

export const SYNC_CONFIGURATION = {

    /** Origin every REST call is sent to. */
    apiBaseUrl: PRODUCTION_API_BASE_URL,

    /** Origin the extension sends the user to for anything it deliberately does not host. */
    websiteBaseUrl: PRODUCTION_WEBSITE_BASE_URL,

    /**
     *  Path of the backend's STOMP-over-WebSocket endpoint that announces data changes.
     */
    websocketPath: "/ws"

} as const;

/** Authentication endpoints of the backend, all of them already deployed and stable. */
export const AUTH_ENDPOINTS = {
    login: "/api/v1/auth/login",
    refresh: "/api/v1/auth/refresh",
    logout: "/api/v1/auth/logout",
    extensionConnect: "/api/v1/auth/extension-connect"
} as const;

/** Endpoints for the account's list of devices. */
export const DEVICE_ENDPOINTS = {
    list: "/api/v1/users/me/devices",
    rename: (deviceId: string): string => `/api/v1/users/me/devices/${deviceId}`,
    takeOver: (deviceId: string): string => `/api/v1/users/me/devices/${deviceId}/take-over`
} as const;

/** Synchronisation endpoints of the backend. */
export const SYNC_ENDPOINTS = {
    snapshot: "/api/v1/sync/snapshot",
    push: "/api/v1/sync/push"
} as const;

/**
 *  Anonymous usage statistics. Aggregates only: what is sent is how many new tabs were opened
 *  on which day, and nothing that says whose they were.
 */
export const STATS_ENDPOINTS = {
    newTabs: "/api/v1/stats/new-tabs"
} as const;

/** Website pages the extension links out to. */
export const WEBSITE_PATHS = {
    register: "/register",

    /** Account settings, which is where upgrading to premium is offered. */
    accountSettings: "/account",

    /**
     *  The page shown in the new tab page's ad slot. A page on the website rather than markup
     *  in the extension, so what is advertised - our own promotion, later an ad network - can
     *  change without an extension release, and no remote code ever runs in the extension.
     */
    adSlot: "/slot/workspace-footer.html"
} as const;

/**
 *  Header naming the machine this extension runs on, shown in the user's device list.
 *  Optional for the backend and never trusted by it; see its ClientRequestHeaders.DEVICE_NAME.
 */
export const DEVICE_NAME_HEADER: string = "X-Device-Name";

/**
 *  Header carrying this installation's own identifier, which is what the backend keys a device
 *  on. See its ClientRequestHeaders.INSTALLATION_ID.
 *
 *  The device name cannot do that job and never could: it is built from navigator.platform,
 *  which is frozen and names the operating system, so every installation on one machine sends
 *  the same string - and the browser name the backend parses out of the user agent is no better,
 *  because Chromium forks impersonate Chrome there deliberately. Two Chromium browsers on one
 *  machine used to collapse into a single device, and signing that device out signed out both.
 */
export const INSTALLATION_ID_HEADER: string = "X-Installation-Id";

/** Absolute URL of a backend endpoint. */
export function buildApiUrl(endpointPath: string): string {
    return `${SYNC_CONFIGURATION.apiBaseUrl}${endpointPath}`;
}

/** Absolute URL of a website page. */
export function buildWebsiteUrl(pagePath: string): string {
    return `${SYNC_CONFIGURATION.websiteBaseUrl}${pagePath}`;
}

/**
 *  Absolute URL of the change notification socket, derived from the API base so that a
 *  switch to localhost moves the socket with it (http → ws, https → wss).
 */
export function buildWebsocketUrl(): string {
    return SYNC_CONFIGURATION.apiBaseUrl.replace(/^http/, "ws") + SYNC_CONFIGURATION.websocketPath;
}
