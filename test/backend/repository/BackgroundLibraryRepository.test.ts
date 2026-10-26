import { beforeEach, describe, expect, it, vi } from "vitest";

import { BackgroundImageRepository } from "../../../src/backend/repository/BackgroundImageRepository";
import { BackgroundLibraryRepository } from "../../../src/backend/repository/BackgroundLibraryRepository";
import { BUILT_IN_BACKGROUNDS } from "../../../src/backend/entity/BuiltInBackgrounds";
import { BACKGROUND_IMAGE_KEY, BACKGROUND_SELECTED_KEY } from "../../../src/backend/datasource/chromeStorage/storageKeys";
import { readFakeStorage, seedFakeStorage } from "../../support/chromeStorageStub";
import { memoryBackgroundUploads } from "../../support/memoryBackgroundUploads";

/**
 *  The background library (#127): the built-in pictures and the user's own, which of them is
 *  behind the page, and taking any of them out of the list.
 */
describe("BackgroundLibraryRepository", () => {

    let images: BackgroundImageRepository;
    let uploads: ReturnType<typeof memoryBackgroundUploads>;
    let fetched: string[];
    let library: BackgroundLibraryRepository;
    let clock: number;

    async function open(): Promise<void> {
        images = new BackgroundImageRepository();
        await images.init();
        library = new BackgroundLibraryRepository(images, uploads,
            async url => { fetched.push(url); return `data:image/webp;base64,${url.slice(-7)}`; },
            () => ++clock);
        await library.init();
    }

    beforeEach(async () => {
        uploads = memoryBackgroundUploads();
        fetched = [];
        clock = 1000;
        await open();
    });

    const tiles = () => library.tiles$.get();
    const firstBuiltIn = BUILT_IN_BACKGROUNDS[0];

    it("offers every built-in picture, by its bundled thumbnail, none chosen", () => {
        expect(tiles()).toHaveLength(BUILT_IN_BACKGROUNDS.length);
        expect(tiles()[0]).toEqual({
            id: firstBuiltIn.id, source: "builtIn", thumbnail: "/backgrounds/01.webp", selected: false
        });
    });

    it("downloads a built-in picture from the website when it is chosen, and puts it behind the page", async () => {
        await library.choose(firstBuiltIn.id);

        expect(fetched).toEqual(["https://tabilinks.app/backgrounds/01.webp"]);
        expect(images.getImage()).toBe("data:image/webp;base64,01.webp");
        expect(tiles().find(tile => tile.selected)?.id).toBe(firstBuiltIn.id);
        expect(readFakeStorage(BACKGROUND_SELECTED_KEY)).toBe(firstBuiltIn.id);
    });

    it("lists the user's own pictures first, newest first, and chooses one when it is added", async () => {
        await library.add("data:older", "thumb:older");
        await library.add("data:newer", "thumb:newer");

        expect(tiles().slice(0, 2).map(tile => [tile.source, tile.thumbnail, tile.selected]))
            .toEqual([["upload", "thumb:newer", true], ["upload", "thumb:older", false]]);
        expect(images.getImage()).toBe("data:newer");
    });

    it("hides a removed built-in picture for good, on this device", async () => {
        await library.remove(firstBuiltIn.id);
        expect(tiles().some(tile => tile.id === firstBuiltIn.id)).toBe(false);

        await open();
        expect(tiles().some(tile => tile.id === firstBuiltIn.id)).toBe(false);
        expect(tiles()).toHaveLength(BUILT_IN_BACKGROUNDS.length - 1);
    });

    it("deletes a removed picture of the user's own, and takes it from behind the page if it is there", async () => {
        await library.add("data:mine", "thumb:mine");
        const mine = tiles()[0];

        await library.remove(mine.id);

        expect(uploads.items.size).toBe(0);
        expect(images.getImage()).toBeNull();
        expect(tiles().some(tile => tile.selected)).toBe(false);
    });

    it("takes the picture away and keeps every tile when none is chosen", async () => {
        await library.choose(firstBuiltIn.id);

        await library.chooseNone();

        expect(images.getImage()).toBeNull();
        expect(tiles()).toHaveLength(BUILT_IN_BACKGROUNDS.length);
    });

    it("adopts a picture put behind the page before the library existed, so it stays in the list", async () => {
        seedFakeStorage(BACKGROUND_IMAGE_KEY, "data:from-before");
        uploads = memoryBackgroundUploads();

        await open();

        expect(tiles()[0]).toMatchObject({ source: "upload", thumbnail: "data:from-before", selected: true });
        expect(uploads.items.size).toBe(1);

        await open();       // and only once
        expect(uploads.items.size).toBe(1);
    });
});

/**
 *  A picture tried before the website had it was answered with a 404 the browser kept for a
 *  week, and the download went on getting that remembered 404 - the picture stayed unavailable
 *  while every other one worked. The download has to ask the server every time.
 */
describe("downloading a built-in picture", () => {

    it("never takes the browser's remembered answer without asking the server", async () => {
        const { fetchAsDataUrl } = await import("../../../src/backend/repository/BackgroundLibraryRepository");
        const asked: RequestInit[] = [];
        vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
            asked.push(init);
            return new Response(new Blob(["webp"]), { headers: { "Content-Type": "image/webp" } });
        });

        expect(await fetchAsDataUrl("https://tabilinks.app/backgrounds/01.webp")).toMatch(/^data:image\/webp;base64,/);
        expect(asked[0]?.cache).toBe("no-cache");
        vi.unstubAllGlobals();
    });

    it("refuses a missing picture rather than putting an error page behind the page", async () => {
        const { fetchAsDataUrl } = await import("../../../src/backend/repository/BackgroundLibraryRepository");
        vi.stubGlobal("fetch", async () => new Response("not found", { status: 404 }));

        await expect(fetchAsDataUrl("https://tabilinks.app/backgrounds/01.webp")).rejects.toThrow(/404/);
        vi.unstubAllGlobals();
    });
});
