import { IndexedDB } from "../datasource/indexedDB/IndexedDB";

/** A picture the user added to the background library, with the tile it is shown as. */
export interface StoredBackground {
    id: string;
    createdAt: number;
    /** A small version for the tile, as a data URL. */
    thumbnail: string;
    /** The picture itself, already shrunk to what is kept, as a data URL. */
    image: string;
}

/**
 *  Where the user's own pictures are kept: IndexedDB, not chrome.storage.local. That one gives
 *  an extension ten megabytes in all, and a library of pictures is many megabytes on its own.
 *  An interface, so the tests - jsdom has no IndexedDB - can keep them in memory.
 */
export interface BackgroundUploadStore {
    all(): Promise<StoredBackground[]>;
    put(background: StoredBackground): Promise<void>;
    remove(id: string): Promise<void>;
}

const NAMESPACE = "background_uploads";

export const indexedDbBackgroundUploads: BackgroundUploadStore = {
    all: () => IndexedDB.getAllFromDB<StoredBackground>(NAMESPACE),
    put: background => IndexedDB.storeInDB(background.id, background, NAMESPACE),
    remove: id => IndexedDB.deleteFromDB(id, NAMESPACE)
};
