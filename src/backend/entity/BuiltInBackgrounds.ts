import { buildWebsiteUrl } from "../sync/SyncConfiguration";

/**
 *  The pictures offered behind the new tab page before the user has added any of their own
 *  (#127): eight themes - space, forest with a cottage, mountains, sea, desert, cyberpunk,
 *  socialist brutalism, night city - each as a photograph and as a drawing.
 *
 *  **Numbered, never named.** They are offered as pictures, not as titles; what each one shows
 *  is for the person looking at it to see.
 *
 *  **The thumbnail ships, the picture does not.** A 3840x2160 picture is one to three megabytes,
 *  and sixteen of them would make every install and every update of the extension that much
 *  heavier. The 384x216 thumbnails are in the package (`public/backgrounds/`); the full picture
 *  is on the website under the same name and is downloaded once, when it is chosen.
 *
 *  All of them are from Unsplash, under the Unsplash License. Where each came from is recorded
 *  beside the full-size files in the website's repository.
 */
export interface BuiltInBackground {
    /** Stable, stored in the device's library state: never renumber one. */
    id: string;
    /** The bundled thumbnail, an extension path. */
    thumbnail: string;
    /** The full picture on the website. */
    fullUrl: string;
}

const COUNT = 16;

export const BUILT_IN_BACKGROUNDS: readonly BuiltInBackground[] = Object.freeze(
    Array.from({ length: COUNT }, (_, index) => {
        const file = `${String(index + 1).padStart(2, "0")}.webp`;
        return {
            id: `built-in-${String(index + 1).padStart(2, "0")}`,
            thumbnail: `/backgrounds/${file}`,
            fullUrl: buildWebsiteUrl(`/backgrounds/${file}`)
        };
    }));

/** Whether an id names one of the built-in pictures rather than an upload. */
export function isBuiltInBackground(id: string): boolean {
    return BUILT_IN_BACKGROUNDS.some(background => background.id === id);
}
