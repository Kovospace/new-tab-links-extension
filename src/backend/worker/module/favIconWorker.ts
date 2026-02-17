
import { BackgroundWorker } from '../abstract/BackgroundWorker'

export interface GetFaviconInput {
  url: string;
}

export interface GetFaviconOutput {
  base64: string
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
    return FavIconWorker.fetchFaviconUrl(input.url)
        .then(FavIconWorker.fetchFaviconBase64)
        .then(buffer => this.response({
              base64: buffer
        } satisfies GetFaviconOutput));
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
      return new URL("/favicon.ico", pageUrl).href;
    } catch {
      // If HTML fetch fails, fallback to /favicon.ico
      return new URL("/favicon.ico", pageUrl).href;
    }
  }

  // private static async fetchFaviconBinary(faviconUrl: string): Promise<ArrayBuffer> {
  //   const res = await fetch(faviconUrl);
  //   if (!res.ok) throw new Error(`Failed to fetch favicon: ${res.status}`);
  //   return res.arrayBuffer();
  // }

  private static async fetchFaviconBase64(faviconUrl: string): Promise<string> {
    const res = await fetch(faviconUrl);
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

    return `data:${mimeType};base64,${base64}`;
  }

}