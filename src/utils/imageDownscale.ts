/**
 *  Shrinks a picture the user chose into something the extension can keep.
 *
 *  The longest side is capped - at `MAX_SIDE` for the picture itself, the size the built-in
 *  backgrounds come in, and much smaller for the tile it is shown as in Settings. The result is
 *  WebP: a background is a photograph far more often than not, a WebP of one is a good deal
 *  smaller than the JPEG and a fraction of the PNG, and the picture in use is held in
 *  `chrome.storage.local`, which gives the whole extension ten megabytes.
 */

/** Longest side of a stored background, in pixels: 4K, as the built-in ones. */
export const MAX_SIDE = 3840;

/** Longest side of a library tile's thumbnail, in pixels. */
export const THUMBNAIL_SIDE = 384;

/** Quality; high, because a background is looked at full screen. */
const QUALITY = 0.85;

/**
 *  @param file    the picture as it came out of the file input
 *  @param maxSide the longest side to keep; `MAX_SIDE` unless said otherwise
 *  @return the picture as a WebP data URL, at most `maxSide` on its longest side
 *  @throws when the file is not a picture the browser can read
 */
export async function downscaleImage(file: Blob, maxSide: number = MAX_SIDE): Promise<string> {

    const bitmap = await createImageBitmap(file);
    try {
        const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
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
        return canvas.toDataURL("image/webp", QUALITY);
    } finally {
        bitmap.close();
    }
}
