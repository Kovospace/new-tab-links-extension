import { WorkerResponse, WorkerMessage } from "../backend/worker/abstract/BackgroundWorker"
import { GetFaviconOutput } from "../backend/worker/module/favIconWorker"

export class FaviconsHandler {

    /* ===============================
     * Config
     * =============================== */

    static DB_NAME = "FaviconsDB";
    static STORE = "favicons";
    static DB_VERSION = 1;

    static ICON_SIZE = 32;

    // in-memory cache (session only)
    static #memoryCache = new Map();

    /* ===============================
     * Public API
     * =============================== */

    /**
     * Returns an <img src> string
     */
    static async get(pageUrl) {
        // 0️⃣ memory cache (fastest)
        if (this.#memoryCache.has(pageUrl)) {
            return this.#memoryCache.get(pageUrl);
        }

        // 1️⃣ IndexedDB cache
        const cachedBlob = await this.#getFromDB(pageUrl);
        if (cachedBlob) {
            console.log(cachedBlob);
            //console.log(cachedBlob instanceof Blob, blob.size);
            const src = URL.createObjectURL(cachedBlob);
            this.#memoryCache.set(pageUrl, src);
            return src;
        }

        // 2️⃣ Chrome favicon service (display-only)
        // if (this.#supportsChromeFavicon()) {
        //     const src = `chrome://favicon/size/${this.ICON_SIZE}@2x/${pageUrl}`;
        //     this.#memoryCache.set(pageUrl, src);
        //     return src;
        // }

        // 3️⃣ Resolve favicon URL (HTML → /favicon.ico)
        const faviconUrl = await this.#resolveFaviconUrl(pageUrl);

        console.log("favicon");

        // 4️⃣ Download via background (no CORS)
        const blob = await this.#fetchViaBackground(faviconUrl);

        console.log(blob instanceof Blob, blob.size);

        // 5️⃣ Persist
        await this.#storeInDB(pageUrl, blob);

        console.log(blob instanceof Blob, blob.size);

        const src = URL.createObjectURL(blob);
        this.#memoryCache.set(pageUrl, src);
        return src;
    }

    /* ===============================
     * Chrome detection
     * =============================== */

    static #supportsChromeFavicon() {
        return (
            typeof chrome !== "undefined" &&
            chrome.runtime &&
            typeof InstallTrigger === "undefined"
        );
    }

    /* ===============================
     * IndexedDB
     * =============================== */

    static #openDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);

            req.onupgradeneeded = () => {
                req.result.createObjectStore(this.STORE);
            };

            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    static async #getFromDB(key) {
        const db = await this.#openDB();
        return new Promise(resolve => {
            const tx = db.transaction(this.STORE, "readonly");
            const req = tx.objectStore(this.STORE).get(key);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
    }

    static async #storeInDB(key, blob) {
        const db = await this.#openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.STORE, "readwrite");
            tx.objectStore(this.STORE).put(blob, key);
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
    }

    /* ===============================
     * Favicon resolution
     * =============================== */

    static async #resolveFaviconUrl(pageUrl) {
        try {
            const html = await this.#fetchHtml(pageUrl);
            const icons = this.#extractIcons(html, pageUrl);
            if (icons.length > 0) return icons[0];
        } catch {
            // ignore
        }

        return this.#defaultFavicon(pageUrl);
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
     * Background fetch (NO CORS)
     * =============================== */

    static #fetchViaBackground(url) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(
                { type: "FETCH_FAVICON", url },
                res => {
                    if (res?.ok) {
                        console.log("RES OK");
                        console.log(blob);
                        const blob = new Blob([res.buffer], { type: "image/x-icon" });
                        resolve(blob);
                    }
                    else reject(res?.error || "Fetch failed");
                }
            );
        });
    }

    //TODO temporary
    // store image bytes and other metadata to database and the viemModel should react to it
    static renderImage(pageUrl) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
            {
              target: "favicon",
              action: "get",
              payload: {
                url: pageUrl,
              } satisfies GetFaviconInput,
            } satisfies WorkerMessage,
            (res: WorkerResponse<GetFaviconOutput>) => {
              console.log(res);
              if (res.success) {
                resolve(res.data.base64);
              } else {
                reject(res?.error || "Fetch failed");
              }
            }
        );
      });
    }
}
