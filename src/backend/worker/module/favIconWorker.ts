
import { BackgroundWorker } from '../abstract/BackgroundWorker'
import { FavIconRepository } from "../../repository/FavIconRepository"

export interface GetFaviconInput {
  url: string;
}

export interface GetFaviconOutput {
  base64: string
}

interface Base64envelope {
  pageUrl: string;
  faviconUrl: string;
  base64?: string;
}

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
    //console.log("called");
    const faviconFromDB = await FavIconRepository.get(input.url);
    // console.log(faviconFromDB);
    if (!faviconFromDB) {
      return FavIconWorker.fetchFaviconUrl(input.url)
        .then(FavIconWorker.fetchFaviconBase64)
        .then(FavIconWorker.saveBase64IntoDB)
        .then(() => this.response({}));
    }
    return this.response({});
  }

  private static async fetchFaviconUrl(pageUrl: string): Promise<string> {
    try {
      // Fetch page HTML
      const res = await fetch(pageUrl);
      const html = await res.text();

      const doc = new DOMParser().parseFromString(html, "text/html");
      const link = doc.querySelector<HTMLLinkElement>('link[rel~="icon"]');

      if (link) {
        const href = link.getAttribute("href");
        if (href) return new URL(href, pageUrl).href;
      }

      // fallback to /favicon.ico
      return {
        faviconUrl: new URL("/favicon.ico", pageUrl).href,
        pageUrl: pageUrl
      } satisfies Base64envelope

    } catch {

      // If HTML fetch fails, fallback to /favicon.ico
      return {
        faviconUrl: new URL("/favicon.ico", pageUrl).href,
        pageUrl: pageUrl
      } satisfies Base64envelope
    }
  }

  private static async fetchFaviconBase64(base64envelope: Base64envelope): Promise<string> {
    const res = await fetch(base64envelope.faviconUrl);
    if (!res.ok) throw new Error(`Failed to fetch favicon: ${res.status}`);

    // ArrayBuffer z fetch
    const buffer = await res.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // Konverzia na Base64
    let binary = "";
    const chunkSize = 0x8000; // 32k chunks pre veľké súbory
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    const base64 = btoa(binary);

    // MIME type – predvolené na favicon
    const mimeType = res.headers.get("content-type") ?? "image/x-icon";

    return {
      base64: `data:${mimeType};base64,${base64}`,
      pageUrl: base64envelope.pageUrl,
      faviconUrl: base64envelope.faviconUrl
    } satisfies Base64envelope;
  }

  private static async saveBase64IntoDB(base64envelope: Base64envelope) {
    return FavIconRepository.save(base64envelope.pageUrl, base64envelope.base64);
  }

}