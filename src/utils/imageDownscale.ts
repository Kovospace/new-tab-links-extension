/**
 *  Shrinks a picture the user chose into something `chrome.storage.local` can hold.
 *
 *  The longest side is capped at `MAX_SIDE`, which keeps a photograph to a few hundred
 *  kilobytes - storage gives the whole extension ten megabytes, and a 4K-wide JPEG can be a
 *  third of that on its own - and the result is a JPEG. A background is a photograph far more
 *  often than not, and a JPEG of one is a tenth of the PNG; a transparent picture loses its
 *  transparency, which behind a page painted in one colour nobody would see anyway.
 */

/** Longest side of a stored background, in pixels. */
export const MAX_SIDE = 2560;

/** JPEG quality; high, because a background is looked at full screen. */
const QUALITY = 0.85;

/**
 *  @param file the picture as it came out of the file input
 *  @return the picture as a JPEG data URL, at most `MAX_SIDE` on its longest side
 *  @throws when the file is not a picture the browser can read
 */
export async function downscaleImage(file: Blob): Promise<string> {

    const bitmap = await createImageBitmap(file);
    try {
        const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
        const width = Math.max(1, Math.round(bitmap.width * scale));
        const height = Math.max(1, Math.round(bitmap.height * scale));

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext("2d");
        if (!context) {
            throw new Error("No 2D canvas to draw the picture with");
        }
        context.drawImage(bitmap, 0, 0, width, height);
        return canvas.toDataURL("image/jpeg", QUALITY);
    } finally {
        bitmap.close();
    }
}
