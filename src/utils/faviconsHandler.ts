export class FaviconsHandler {

    static DB_NAME = "FaviconsDB";
    static STORE_NAME = "favicons";
    static DB_VERSION = 1;

    /* ===============================
     * Public API
     * =============================== */

    /**
     * Main entry point
     * Returns an image src (object URL)
     */
    static async get(pageUrl) {
        // 1️⃣ Serve from cache if available
        const cached = await this.#getCachedBlob(pageUrl);
        if (cached) {
            return URL.createObjectURL(cached);
        }

        // 2️⃣ Resolve favicon URL
        const faviconUrl = await this.#resolveFaviconUrl(pageUrl);

        // 3️⃣ Download favicon
        const blob = await this.#downloadFavicon(faviconUrl, pageUrl);

        // 4️⃣ Cache it
        await this.#storeBlob(pageUrl, blob);

        // 5️⃣ Return usable URL
        return URL.createObjectURL(blob);
    }

    /* ===============================
     * IndexedDB
     * =============================== */

    static #openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

            request.onupgradeneeded = () => {
                request.result.createObjectStore(this.STORE_NAME);
            };

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    static async #getCachedBlob(key) {
        const db = await this.#openDB();
        return new Promise(resolve => {
            const tx = db.transaction(this.STORE_NAME, "readonly");
            const req = tx.objectStore(this.STORE_NAME).get(key);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
    }

    static async #storeBlob(key, blob) {
        const db = await this.#openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.STORE_NAME, "readwrite");
            tx.objectStore(this.STORE_NAME).put(blob, key);
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
    }

    /* ===============================
     * Favicon resolution
     * =============================== */

    static async #resolveFaviconUrl(pageUrl) {
        // Chrome / Brave / Edge
        if (this.#supportsChromeFavicon()) {
            return `chrome://favicon/size/32@2x/${pageUrl}`;
        }

        // Fallback: parse HTML
        try {
            const html = await this.#fetchHtml(pageUrl);
            const icons = this.#extractIcons(html, pageUrl);
            if (icons.length > 0) {
                return icons[0];
            }
        } catch {
            // ignore
        }

        // Last resort
        return this.#defaultFavicon(pageUrl);
    }

    static #supportsChromeFavicon() {
        return (
            typeof chrome !== "undefined" &&
            chrome.runtime &&
            typeof InstallTrigger === "undefined" // not Firefox
        );
    }

    static async #fetchHtml(url) {
        const res = await fetch(url);
        if (!res.ok) throw new Error("HTML fetch failed");
        return res.text();
    }

    static #extractIcons(html, baseUrl) {
        const doc = new DOMParser().parseFromString(html, "text/html");
        return [...doc.querySelectorAll('link[rel~="icon"]')]
            .map(link => {
                try {
                    return new URL(link.getAttribute("href"), baseUrl).href;
                } catch {
                    return null;
                }
            })
            .filter(Boolean);
    }

    static #defaultFavicon(pageUrl) {
        try {
            const u = new URL(pageUrl);
            return `${u.origin}/favicon.ico`;
        } catch {
            return "";
        }
    }

    /* ===============================
     * Network
     * =============================== */

    static async #downloadFavicon(faviconUrl, pageUrl) {
        try {
            const res = await fetch(faviconUrl);
            if (!res.ok) throw new Error();
            return await res.blob();
        } catch {
            // fallback to /favicon.ico
            const res = await fetch(this.#defaultFavicon(pageUrl));
            return await res.blob();
        }
    }
}
