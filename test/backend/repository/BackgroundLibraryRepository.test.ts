import { beforeEach, describe, expect, it, vi } from "vitest";

import { BackgroundImageRepository } from "../../../src/backend/repository/BackgroundImageRepository";
import {
    BackgroundLibraryRepository, BackgroundStorageError, BackgroundUnavailableError
} from "../../../src/backend/repository/BackgroundLibraryRepository";
import { BUILT_IN_BACKGROUNDS, DEFAULT_BACKGROUND_ID } from "../../../src/backend/entity/BuiltInBackgrounds";
import {
    BACKGROUND_DEFAULT_PENDING_KEY, BACKGROUND_IMAGE_KEY, BACKGROUND_SELECTED_KEY
} from "../../../src/backend/datasource/chromeStorage/storageKeys";
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

    it("tells a picture that could not be downloaded from one that could not be kept", async () => {
        const offline = new BackgroundLibraryRepository(images, uploads,
            async () => { throw new Error("Failed to fetch"); });
        await offline.init();
        await expect(offline.choose(firstBuiltIn.id)).rejects.toBeInstanceOf(BackgroundUnavailableError);

        images.setImage = async () => { throw new Error("QUOTA_BYTES quota exceeded"); };
        await expect(library.choose(firstBuiltIn.id)).rejects.toBeInstanceOf(BackgroundStorageError);
        expect(tiles().some(tile => tile.selected)).toBe(false);
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

/**
 *  #175: a fresh install starts with built-in picture 02 rather than a bare page. The worker asks
 *  for it on install; the page downloads it, and any choice the user makes wins.
 */
describe("the install's default background", () => {

    let images: BackgroundImageRepository;
    let fetched: string[];
    let fetchPicture: (url: string) => Promise<string>;
    let library: BackgroundLibraryRepository;

    async function open(): Promise<void> {
        images = new BackgroundImageRepository();
        await images.init();
        library = new BackgroundLibraryRepository(images, memoryBackgroundUploads(),
            url => { fetched.push(url); return fetchPicture(url); }, () => 1000);
    }

    beforeEach(async () => {
        fetched = [];
        fetchPicture = async url => `data:image/webp;base64,${url.slice(-7)}`;
        await open();
    });

    it("puts picture 02 behind the page of a fresh install, once", async () => {
        seedFakeStorage(BACKGROUND_DEFAULT_PENDING_KEY, true);

        await library.applyInstallDefault();

        expect(fetched).toEqual(["https://tabilinks.app/backgrounds/02.webp"]);
        expect(images.getImage()).toBe("data:image/webp;base64,02.webp");
        expect(readFakeStorage(BACKGROUND_SELECTED_KEY)).toBe(DEFAULT_BACKGROUND_ID);
        expect(readFakeStorage(BACKGROUND_DEFAULT_PENDING_KEY)).toBe(false);

        await images.clear();
        await library.applyInstallDefault();
        expect(fetched).toHaveLength(1);
        expect(images.getImage()).toBeNull();
    });

    it("does nothing where the worker never asked - an update, or an install from before #175", async () => {
        await library.applyInstallDefault();

        expect(fetched).toEqual([]);
        expect(images.getImage()).toBeNull();
    });

    it("keeps asking after a failed download, so an install made offline still gets it", async () => {
        seedFakeStorage(BACKGROUND_DEFAULT_PENDING_KEY, true);
        fetchPicture = async () => { throw new Error("offline"); };

        await library.applyInstallDefault();
        expect(images.getImage()).toBeNull();
        expect(readFakeStorage(BACKGROUND_DEFAULT_PENDING_KEY)).toBe(true);

        fetchPicture = async url => `data:${url.slice(-7)}`;
        await open();
        await library.applyInstallDefault();
        expect(images.getImage()).toBe("data:02.webp");
    });

    it("never covers a choice made while the picture was downloading - not even 'none'", async () => {
        seedFakeStorage(BACKGROUND_DEFAULT_PENDING_KEY, true);
        let arrive: (picture: string) => void = () => {};
        fetchPicture = () => new Promise(resolve => { arrive = resolve; });

        const applying = library.applyInstallDefault();
        await vi.waitFor(() => expect(fetched).toHaveLength(1));
        await library.chooseNone();
        arrive("data:late");
        await applying;

        expect(images.getImage()).toBeNull();
        expect(readFakeStorage(BACKGROUND_SELECTED_KEY)).toBeNull();
    });

    it("leaves a picture already behind the page alone", async () => {
        seedFakeStorage(BACKGROUND_IMAGE_KEY, "data:mine");
        seedFakeStorage(BACKGROUND_DEFAULT_PENDING_KEY, true);
        await open();

        await library.applyInstallDefault();

        expect(fetched).toEqual([]);
        expect(images.getImage()).toBe("data:mine");
        expect(readFakeStorage(BACKGROUND_DEFAULT_PENDING_KEY)).toBe(false);
    });
});
