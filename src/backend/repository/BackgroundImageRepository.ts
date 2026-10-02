import { ChromeStorageWrapper } from "../datasource/chromeStorage/chromeStorageWrapper";
import { BACKGROUND_IMAGE_KEY } from "../datasource/chromeStorage/storageKeys";
import { Logger } from "../../utils/logger";
import { ObservableValue } from "../../utils/observableValue";

/**
 *  The picture a premium user has put behind the new tab page.
 *
 *  **Per device, like the size slider**, and for a reason of its own besides: it is a picture,
 *  and a picture on the profile record would be a backend column holding megabytes that every
 *  push and every pull carries. A desktop and a laptop wanting different wallpapers is the
 *  ordinary case anyway.
 *
 *  **Stored whatever the account's standing**, and only *shown* to a premium account - that is
 *  the page's decision (`PageBackground`), not this one's. A subscription that lapses and is
 *  renewed gets its picture back rather than being asked to find it again.
 *
 *  Held as a data URL, already shrunk (`utils/imageDownscale.ts`): `chrome.storage.local` gives
 *  an extension without `unlimitedStorage` ten megabytes in all, and a photograph straight off
 *  a camera is most of that on its own.
 */
export class BackgroundImageRepository {

    private LOG: Logger = new Logger("BackgroundImageRepository");
    private datasource = new ChromeStorageWrapper();
    private watching = false;

    /** The picture as a data URL, or null when the page has none of its own. */
    public readonly image$ = new ObservableValue<string | null>(null);

    /** Loads the stored picture, and follows changes made in other open pages. */
    public async init(): Promise<void> {
        const stored = await this.datasource.get<string>(BACKGROUND_IMAGE_KEY);
        this.image$.set(typeof stored === "string" && stored.length > 0 ? stored : null);
        this.watchForWrites();
    }

    /** The picture, or null. */
    public getImage(): string | null {
        return this.image$.get();
    }

    /**
     *  Puts a picture behind the page.
     *
     *  @param dataUrl the picture, already shrunk to something storage can hold
     */
    public async setImage(dataUrl: string): Promise<void> {
        this.LOG.debug("setImage", `${Math.round(dataUrl.length / 1024)} kB`);
        await this.datasource.save(BACKGROUND_IMAGE_KEY, dataUrl);
        this.image$.set(dataUrl);
    }

    /** Takes the picture away, which brings the logo back. */
    public async clear(): Promise<void> {
        await this.datasource.save(BACKGROUND_IMAGE_KEY, null);
        this.image$.set(null);
    }

    /**
     *  Adopts a picture chosen in another open new tab page.
     *
     *  chrome.storage.onChanged is absent in the tests, which fake the storage rather than the
     *  whole API, so its absence is not an error.
     */
    private watchForWrites(): void {
        if (this.watching || !chrome.storage?.onChanged?.addListener) {
            return;
        }
        this.watching = true;

        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== "local" || !(BACKGROUND_IMAGE_KEY in changes)) {
                return;
            }
            const incoming = changes[BACKGROUND_IMAGE_KEY].newValue;
            this.image$.set(typeof incoming === "string" && incoming.length > 0 ? incoming : null);
        });
    }
}

export const backgroundImageRepository = new BackgroundImageRepository();
