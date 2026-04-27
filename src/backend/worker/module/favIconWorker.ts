
import {BackgroundWorker} from '../abstract/BackgroundWorker'
import { FavIconRepository } from "../../repository/FavIconRepository"

export interface GetFaviconInput {
  url: string;
}

export interface GetFaviconOutput {
  base64: string
}

/** Resolved favicon: either a real base64 data URI or a fallback asset path */
interface ResolvedFavicon {
  pageUrl: string;
  /** base64 data URI, or a static path like '/gfx/favicon-default.svg' */
  iconSrc: string;
}

const ICON_DEFAULT = '/gfx/favicon-default.svg';
const ICON_BROKEN  = '/gfx/favicon-broken.svg';

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

  private async get(input: GetFaviconInput) {
    let iconSrc = await FavIconRepository.get(input.url);
    if (!iconSrc) {
      const resolved = await FavIconWorker.resolveFavicon(input.url);
      await FavIconRepository.save(resolved.pageUrl, resolved.iconSrc);
      iconSrc = resolved.iconSrc;
    }
    return this.response({base64: iconSrc});
  }

  private async refresh(input: GetFaviconInput) {
    await FavIconRepository.delete(input.url);
    const resolved = await FavIconWorker.resolveFavicon(input.url);
    await FavIconRepository.save(resolved.pageUrl, resolved.iconSrc);
    return this.response({base64: resolved.iconSrc});
  }

  /**
   * Determines the icon src for a given page URL.
   *
   * 1. Chrome's built-in _favicon API: fast, uses Chrome's favicon cache for visited URLs.
   * 2. Falls back to fetching page HTML and parsing <link rel="icon"> tags.
   *    This covers newly added links the user has never visited.
   */
  private static async resolveFavicon(pageUrl: string): Promise<ResolvedFavicon> {
    try {
      const iconSrc = await FavIconWorker.fetchViaChromeFaviconApi(pageUrl);
      return { pageUrl, iconSrc };
    } catch {
      // Chrome has no cached favicon for this URL — fall through to HTML parsing
    }

    let html: string;
    try {
      const res = await fetch(pageUrl);
      if (!res.ok) {
        return { pageUrl, iconSrc: ICON_BROKEN };
      }
      html = await res.text();
    } catch {
      return { pageUrl, iconSrc: ICON_BROKEN };
    }

    const candidates = FavIconWorker.extractFaviconCandidates(html, pageUrl);
    for (const candidateUrl of candidates) {
      try {
        const base64 = await FavIconWorker.fetchFaviconBase64(candidateUrl);
        return { pageUrl, iconSrc: base64 };
      } catch {
        // This candidate failed — try the next one
      }
    }

    return { pageUrl, iconSrc: ICON_DEFAULT };
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

  // ── HTML parsing fallback ────────────────────────────────────────────────

  /**
   * Returns favicon URL candidates in priority order: all <link rel~="icon"> hrefs
   * from the page HTML, then /favicon.ico as a universal fallback.
   */
  private static extractFaviconCandidates(html: string, pageUrl: string): string[] {
    const candidates: string[] = [];
    try {
      const doc = new DOMParser().parseFromString(html, "text/html");
      const links = doc.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]');
      for (const link of links) {
        const href = link.getAttribute("href");
        if (!href) continue;
        try {
          candidates.push(new URL(href, pageUrl).href);
        } catch {
          // malformed href — skip
        }
      }
    } catch {
      // DOMParser unavailable — skip to /favicon.ico fallback
    }
    candidates.push(new URL("/favicon.ico", pageUrl).href);
    return candidates;
  }

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