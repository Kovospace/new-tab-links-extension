import { BackgroundUploadStore, StoredBackground } from "../../src/backend/repository/BackgroundUploadStore";

/** The background library's uploads kept in memory: jsdom has no IndexedDB. */
export function memoryBackgroundUploads(initial: StoredBackground[] = []): BackgroundUploadStore & { items: Map<string, StoredBackground> } {
    const items = new Map(initial.map(item => [item.id, item]));
    return {
        items,
        all: async () => [...items.values()],
        put: async background => { items.set(background.id, background); },
        remove: async id => { items.delete(id); }
    };
}
