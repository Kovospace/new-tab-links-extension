chrome.runtime.onMessage.addListener((msg, _, sendResponse) => {
    if (msg.type === "FETCH_FAVICON") {
        const pageUrl = msg.url;
        console.log("[Background] Fetch favicon request:", pageUrl);

        // Resolve favicon URL then fetch only the icon
        fetchFaviconUrl(pageUrl)
            .then(fetchFaviconBinary)
            .then(buffer => {
              console.log("background buffer");
              console.log(buffer);
              return sendResponse({
                ok: true,
                buffer: Array.from(new Uint8Array(buffer))
              })
            })
            .catch(err => sendResponse({
              ok: false,
              error: err.message
            }));

        return true; // keep message channel open for async
    }
});

/**
 * Resolve the actual favicon URL for a given page
 */
async function fetchFaviconUrl(pageUrl: string): Promise<string> {
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

/**
 * Fetch only the favicon as binary (ArrayBuffer)
 */
async function fetchFaviconBinary(faviconUrl: string): Promise<ArrayBuffer> {
    const res = await fetch(faviconUrl);
    if (!res.ok) throw new Error(`Failed to fetch favicon: ${res.status}`);
    return res.arrayBuffer();
}