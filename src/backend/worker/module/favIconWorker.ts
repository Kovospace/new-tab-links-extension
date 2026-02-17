
import { BackgroundWorker } from '../abstract/BackgroundWorker'

export interface GetFaviconInput {
  url: string;
}

export interface GetFaviconOutput {
  bytes: Uint8Array;
  mimeType: string;
}

export class FavIconWorker extends BackgroundWorker<GetFaviconInput, GetFaviconOutput> {

  async handle(action: string, payload: GetFaviconInput) {
    switch (action) {
      case "get":
        return this.get(payload);
      default:
        return this.errorResponse(
            "UNKNOWN_ACTION",
            `Action ${action} not supported`
        );
    }
  }

  private async get(input: GetFaviconInput) {

    FavIconWorker.fetchFaviconUrl(pageUrl)
        .then(FavIconWorker.fetchFaviconBinary)
        .then(buffer => this.response(
            {
              bytes: Array.from(new Uint8Array(buffer)),
              mimeType: "image/png"
            }));


    //const origin = new URL(input.url).origin;
    //const faviconUrl = `${origin}/favicon.ico`;

    // const res = await fetch(faviconUrl);
    // if (!res.ok) {
    //   return this.errorResponse(
    //       "FAVICON_NOT_FOUND",
    //       faviconUrl
    //   );
    // }
    //
    // const buffer = await res.arrayBuffer();
    //
    // return this.response({
    //   bytes: new Uint8Array(buffer),
    //   mimeType:
    //       res.headers.get("content-type") ?? "image/x-icon",
    // });
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

  private static async fetchFaviconBinary(faviconUrl: string): Promise<ArrayBuffer> {
    const res = await fetch(faviconUrl);
    if (!res.ok) throw new Error(`Failed to fetch favicon: ${res.status}`);
    return res.arrayBuffer();
  }

}