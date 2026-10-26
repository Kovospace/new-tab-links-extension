import { ChromeStorageWrapper } from "../datasource/chromeStorage/chromeStorageWrapper";
import {
    BACKGROUND_HIDDEN_BUILT_INS_KEY, BACKGROUND_SELECTED_KEY
} from "../datasource/chromeStorage/storageKeys";
import { BUILT_IN_BACKGROUNDS, isBuiltInBackground } from "../entity/BuiltInBackgrounds";
import { BackgroundImageRepository, backgroundImageRepository } from "./BackgroundImageRepository";
import { BackgroundUploadStore, indexedDbBackgroundUploads, StoredBackground } from "./BackgroundUploadStore";
import { uid } from "./AppStateRepositoryUtils";
import { Logger } from "../../utils/logger";
import { ObservableValue } from "../../utils/observableValue";

/** One tile of the library, as Settings draws it. */
export interface BackgroundTile {
    id: string;
    source: "builtIn" | "upload";
    /** What the tile shows: an extension path or a data URL. */
    thumbnail: string;
    /** Whether it is the picture behind the page now. */
    selected: boolean;
}

/** Reads a picture from the network into a data URL: the website's copy of a built-in one. */
export type PictureFetcher = (url: string) => Promise<string>;

const fetchAsDataUrl: PictureFetcher = async url => {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`${url} answered ${response.status}`);
    }
    const blob = await response.blob();
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
};

/**
 *  The pictures to choose a background from (#127): the built-in ones and the user's own, each
 *  removable, and which of them is in use.
 *
 *  **The picture in use is still `BackgroundImageRepository`'s**, under its own key in
 *  chrome.storage.local, so a new tab draws it at once without opening a database. Choosing a
 *  tile copies its picture there; this keeps the library and remembers which tile that was.
 *
 *  **Per device, like the picture.** Nothing here is synchronised: pictures are megabytes, and a
 *  desktop and a laptop wanting different ones is the ordinary case.
 *
 *  **Removing a built-in picture hides it** on this device; it cannot be deleted from the package.
 *  Removing the picture in use also takes it from behind the page.
 */
export class BackgroundLibraryRepository {

    private LOG: Logger = new Logger("BackgroundLibraryRepository");
    private readonly storage = new ChromeStorageWrapper();

    private uploadsCache: StoredBackground[] = [];
    private hidden: string[] = [];
    private selected: string | null = null;

    public readonly tiles$ = new ObservableValue<BackgroundTile[]>([]);

    constructor(
        private readonly images: BackgroundImageRepository = backgroundImageRepository,
        private readonly uploads: BackgroundUploadStore = indexedDbBackgroundUploads,
        private readonly fetchPicture: PictureFetcher = fetchAsDataUrl,
        private readonly now: () => number = Date.now
    ) {}

    /**
     *  Reads the library. A picture in use that the library has never seen - one put there
     *  before the library existed - becomes the first of the user's own, so it is not lost from
     *  the list the moment there is one.
     */
    public async init(): Promise<void> {
        const hidden = await this.storage.get<string[]>(BACKGROUND_HIDDEN_BUILT_INS_KEY);
        this.hidden = Array.isArray(hidden) ? hidden : [];
        const selected = await this.storage.get<string>(BACKGROUND_SELECTED_KEY);
        this.selected = typeof selected === "string" && selected.length > 0 ? selected : null;
        this.uploadsCache = await this.uploads.all();

        const current = this.images.getImage();
        if (current && this.selected === null) {
            const adopted: StoredBackground = { id: uid(), createdAt: this.now(), thumbnail: current, image: current };
            await this.uploads.put(adopted);
            this.uploadsCache.push(adopted);
            await this.select(adopted.id);
            this.LOG.debug("init", "Adopted the picture in use into the library");
        }
        this.publish();
    }

    /**
     *  Puts a tile's picture behind the page. A built-in one is downloaded first - a few
     *  megabytes, once - and fails without a connection; the caller says so.
     */
    public async choose(id: string): Promise<void> {
        let picture: string;
        if (isBuiltInBackground(id)) {
            picture = await this.fetchPicture(BUILT_IN_BACKGROUNDS.find(one => one.id === id)!.fullUrl);
        } else {
            const upload = this.uploadsCache.find(one => one.id === id);
            if (!upload) {
                return;
            }
            picture = upload.image;
        }
        await this.images.setImage(picture);
        await this.select(id);
        this.publish();
    }

    /** No picture behind the page; the library keeps every tile. */
    public async chooseNone(): Promise<void> {
        await this.images.clear();
        await this.select(null);
        this.publish();
    }

    /**
     *  Adds a picture of the user's own, and puts it behind the page.
     *
     *  @param image     the picture, already shrunk to what is kept
     *  @param thumbnail a small version for its tile
     */
    public async add(image: string, thumbnail: string): Promise<void> {
        const added: StoredBackground = { id: uid(), createdAt: this.now(), thumbnail, image };
        await this.uploads.put(added);
        this.uploadsCache.push(added);
        await this.choose(added.id);
    }

    /** Takes a tile out of the library - and its picture from behind the page, if it is there. */
    public async remove(id: string): Promise<void> {
        if (isBuiltInBackground(id)) {
            if (!this.hidden.includes(id)) {
                this.hidden = [...this.hidden, id];
                await this.storage.save(BACKGROUND_HIDDEN_BUILT_INS_KEY, this.hidden);
            }
        } else {
            await this.uploads.remove(id);
            this.uploadsCache = this.uploadsCache.filter(one => one.id !== id);
        }
        if (this.selected === id) {
            await this.images.clear();
            await this.select(null);
        }
        this.publish();
    }

    private async select(id: string | null): Promise<void> {
        this.selected = id;
        await this.storage.save(BACKGROUND_SELECTED_KEY, id);
    }

    /** The user's own first, newest first - what they added is what they look for - then the built-in ones. */
    private publish(): void {
        const own: BackgroundTile[] = [...this.uploadsCache]
            .sort((first, second) => second.createdAt - first.createdAt)
            .map(one => ({ id: one.id, source: "upload", thumbnail: one.thumbnail, selected: one.id === this.selected }));
        const builtIn: BackgroundTile[] = BUILT_IN_BACKGROUNDS
            .filter(one => !this.hidden.includes(one.id))
            .map(one => ({ id: one.id, source: "builtIn", thumbnail: one.thumbnail, selected: one.id === this.selected }));
        this.tiles$.set([...own, ...builtIn]);
    }
}

export const backgroundLibraryRepository = new BackgroundLibraryRepository();
