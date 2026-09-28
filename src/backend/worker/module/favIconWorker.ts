
import {BackgroundWorker} from '../abstract/BackgroundWorker'
import { CachedFavicon, FaviconMiss, FavIconRepository } from "../../repository/FavIconRepository"
import { extractFaviconCandidates } from "./faviconCandidates"

export interface GetFaviconInput {
  url: string;
}

export interface GetFaviconOutput {
  base64: string
}

const ICON_DEFAULT = '/gfx/favicon-default.svg';
const ICON_BROKEN  = '/gfx/favicon-broken.svg';

/**
 *  How long a miss is trusted before the network is asked again.
 *
 *  Every new tab page asks for the icon of every link it draws, so without a pause a workspace
 *  of links with no findable icon would fetch each of those pages on every new tab. Chrome's
 *  own favicon cache is not held to this: it is local, and it is what fills the moment the
 *  user visits the page.
 */
export const NETWORK_RETRY_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Whether the cache holds a real icon, as opposed to a miss or nothing. */
export function isIcon(cached: CachedFavicon | null): cached is string {
  return typeof cached === "string" && cached.startsWith("data:");
}

/**
 *  Whether a page with no icon yet should be fetched again.
 *  A bare asset path is a miss stored before misses carried a time, and is due at once.
 */
export function isNetworkRetryDue(cached: CachedFavicon | null, now: number): boolean {
  if (cached === null || typeof cached === "string") return true;
  return now - cached.missedAt >= NETWORK_RETRY_INTERVAL_MS;
}

/** What a page with no icon is drawn with. */
function fallbackOf(cached: CachedFavicon | null): string {
  if (cached === null) return ICON_DEFAULT;
  return typeof cached === "string" ? cached : cached.fallback;
}

export class FavIconWorker extends BackgroundWorker<GetFaviconInput, GetFaviconOutput> {

  async handle(action: string, payload: GetFaviconInput) {
    switch (action) {
      case "get":
        return this.get(payload);
      case "refresh":
        return this.refresh(payload);
      default:
        return this.errorResponse(
            "FAVICON_WORKER_UNKNOWN_ACTION",
            `Action ${action} not supported`
        );
    }
  }

  /**
   *  The icon for a page, looking again for one that is missing.
   *
   *  A link synchronised from another browser arrives on one that has never visited it, so
   *  the first lookup there often finds nothing. That used to be final. Now Chrome's own
   *  cache is asked on every draw - cheap, and it fills as soon as the page is visited here -
   *  and the network is asked again once the last miss is old enough.
   */
  private async get(input: GetFaviconInput) {
    const cached = await FavIconRepository.get(input.url);
    if (isIcon(cached)) {
      return this.response({base64: cached});
    }

    const fromChrome = await FavIconWorker.tryChromeFaviconApi(input.url);
    if (fromChrome) {
      await FavIconRepository.save(input.url, fromChrome);
      return this.response({base64: fromChrome});
    }

    if (!isNetworkRetryDue(cached, Date.now())) {
      return this.response({base64: fallbackOf(cached)});
    }

    return this.response({base64: await FavIconWorker.resolveFromNetworkAndStore(input.url)});
  }

  /** Asked for by the user, so it ignores both the cache and the retry interval. */
  private async refresh(input: GetFaviconInput) {
    await FavIconRepository.delete(input.url);

    const fromChrome = await FavIconWorker.tryChromeFaviconApi(input.url);
    if (fromChrome) {
      await FavIconRepository.save(input.url, fromChrome);
      return this.response({base64: fromChrome});
    }
    return this.response({base64: await FavIconWorker.resolveFromNetworkAndStore(input.url)});
  }

  /** Chrome's cached icon for the page, or null when Chrome has none. */
  private static async tryChromeFaviconApi(pageUrl: string): Promise<string | null> {
    try {
      return await FavIconWorker.fetchViaChromeFaviconApi(pageUrl);
    } catch {
      return null;
    }
  }

  /**
   *  Fetches the page, finds its icon, and stores what came of it - the icon, or a miss
   *  with the time it happened. Returns what the link should be drawn with.
   */
  private static async resolveFromNetworkAndStore(pageUrl: string): Promise<string> {
    const resolved = await FavIconWorker.resolveFromNetwork(pageUrl);
    await FavIconRepository.save(pageUrl, resolved);
    return typeof resolved === "string" ? resolved : resolved.fallback;
  }

  /**
   *  Fetches the page HTML and tries the icons it declares, then /favicon.ico.
   *  This covers links this browser has never visited, which Chrome's cache knows nothing of.
   */
  private static async resolveFromNetwork(pageUrl: string): Promise<string | FaviconMiss> {
    const miss = (fallback: string): FaviconMiss => ({ missedAt: Date.now(), fallback });

    let html: string;
    try {
      const res = await fetch(pageUrl);
      if (!res.ok) {
        return miss(ICON_BROKEN);
      }
      html = await res.text();
    } catch {
      return miss(ICON_BROKEN);
    }

    const candidates = extractFaviconCandidates(html, pageUrl);
    for (const candidateUrl of candidates) {
      try {
        return await FavIconWorker.fetchFaviconBase64(candidateUrl);
      } catch {
        // This candidate failed — try the next one
      }
    }

    return miss(ICON_DEFAULT);
  }

  // ── Chrome _favicon API ───────────────────────────────────────────────────

  /**
   * Raw base64 of Chrome's "no favicon" placeholder, lazily fetched once per
   * service-worker lifetime and used to detect when Chrome has nothing cached.
   *
   * undefined = not yet fetched; null = fetch failed (skip comparison).
   */
  private static _chromeFaviconDefault: string | null | undefined = undefined;

  /**
   * Returns a base64 data URI via Chrome's internal _favicon API.
   * Throws if Chrome returns its generic placeholder (URL not in Chrome's favicon cache).
   */
  private static async fetchViaChromeFaviconApi(pageUrl: string): Promise<string> {
    if (this._chromeFaviconDefault === undefined) {
      // .invalid is an IANA-reserved TLD that never resolves — always yields Chrome's default icon
      this._chromeFaviconDefault = await FavIconWorker.fetchChromeApiRaw("https://definitely.invalid/");
    }

    const raw = await FavIconWorker.fetchChromeApiRaw(pageUrl);
    if (raw === null) throw new Error("Chrome favicon API unavailable");

    if (this._chromeFaviconDefault !== null && raw === this._chromeFaviconDefault) {
      throw new Error("Chrome has no cached favicon for this URL");
    }

    return `data:image/png;base64,${raw}`;
  }

  /**
   * Calls Chrome's _favicon endpoint and returns the response as raw base64.
   * Returns null on any failure.
   */
  private static async fetchChromeApiRaw(pageUrl: string): Promise<string | null> {
    try {
      const url = new URL(chrome.runtime.getURL("/_favicon/"));
      url.searchParams.set("pageUrl", pageUrl);
      url.searchParams.set("size", "32");

      const res = await fetch(url.toString());
      if (!res.ok) return null;

      return FavIconWorker.bufferToBase64(await res.arrayBuffer());
    } catch {
      return null;
    }
  }

  // ── Icon download ────────────────────────────────────────────────────────

  private static async fetchFaviconBase64(faviconUrl: string): Promise<string> {
    // data: URIs need no fetch — validate and return directly
    if (faviconUrl.startsWith("data:")) {
      if (!faviconUrl.startsWith("data:image/")) {
        throw new Error("Data URI is not an image");
      }
      return faviconUrl;
    }

    const res = await fetch(faviconUrl);
    if (!res.ok) throw new Error(`Failed to fetch favicon: ${res.status}`);

    // Reject HTML/text responses (e.g. auth redirect pages served instead of the icon)
    const mimeType = res.headers.get("content-type")?.split(";")[0].trim() ?? "";
    if (!mimeType.startsWith("image/") && mimeType !== "application/octet-stream") {
      throw new Error(`Not an image response: ${mimeType}`);
    }

    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > 200_000) {
      throw new Error(`Favicon too large: ${buffer.byteLength} bytes`);
    }

    return `data:${mimeType};base64,${FavIconWorker.bufferToBase64(buffer)}`;
  }

  // ── Utilities ────────────────────────────────────────────────────────────

  private static bufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }
}