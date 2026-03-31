
import {BackgroundWorker, WorkerResponse} from '../abstract/BackgroundWorker'
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
      default:
        return this.errorResponse(
            "FAVICON_WORKER_UNKNOWN_ACTION",
            `Action ${action} not supported`
        );
    }
  }

  private async get(input: GetFaviconInput) {
    const faviconFromDB = await FavIconRepository.get(input.url);
    if (!faviconFromDB) {
      const resolved = await FavIconWorker.resolveFavicon(input.url);
      await FavIconRepository.save(resolved.pageUrl, resolved.iconSrc);
    }
    return this.response({});
  }

  /**
   * Determines the icon src for a given page URL.
   *
   * - If the page is unreachable (network error or non-2xx): returns ICON_BROKEN path.
   * - If the page is reachable but has no usable favicon: returns ICON_DEFAULT path.
   * - If a favicon is found and fetched: returns a base64 data URI.
   */
  private static async resolveFavicon(pageUrl: string): Promise<ResolvedFavicon> {
    let html: string;
    try {
      const res = await fetch(pageUrl);
      if (!res.ok) {
        return { pageUrl, iconSrc: ICON_BROKEN };
      }
      html = await res.text();
    } catch {
      // Network error — page unreachable
      return { pageUrl, iconSrc: ICON_BROKEN };
    }

    // Page is reachable; find favicon URL from <link rel="icon"> or fall back to /favicon.ico
    const doc = new DOMParser().parseFromString(html, "text/html");
    const iconLink = doc.querySelector<HTMLLinkElement>('link[rel~="icon"]');
    const faviconUrl = iconLink?.getAttribute("href")
        ? new URL(iconLink.getAttribute("href")!, pageUrl).href
        : new URL("/favicon.ico", pageUrl).href;

    try {
      const base64 = await FavIconWorker.fetchFaviconBase64(faviconUrl);
      return { pageUrl, iconSrc: base64 };
    } catch {
      // Site works but no favicon found
      return { pageUrl, iconSrc: ICON_DEFAULT };
    }
  }

  private static async fetchFaviconBase64(faviconUrl: string): Promise<string> {
    const res = await fetch(faviconUrl);
    if (!res.ok) throw new Error(`Failed to fetch favicon: ${res.status}`);

    const buffer = await res.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    let binary = "";
    const chunkSize = 0x8000; // 32k chunks for large files
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    const base64 = btoa(binary);

    const mimeType = res.headers.get("content-type") ?? "image/x-icon";
    return `data:${mimeType};base64,${base64}`;
  }

}