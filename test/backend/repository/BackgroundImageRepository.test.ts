import { beforeEach, describe, expect, it } from "vitest";

import { BackgroundImageRepository } from "../../../src/backend/repository/BackgroundImageRepository";
import { BACKGROUND_IMAGE_KEY } from "../../../src/backend/datasource/chromeStorage/storageKeys";
import { readFakeStorage, seedFakeStorage } from "../../support/chromeStorageStub";

const PICTURE = "data:image/jpeg;base64,AAAA";

describe("BackgroundImageRepository", () => {

    let images: BackgroundImageRepository;

    beforeEach(async () => {
        images = new BackgroundImageRepository();
        await images.init();
    });

    it("starts with no picture, which is the logo", () => {
        expect(images.getImage()).toBeNull();
    });

    it("remembers a picture", async () => {
        await images.setImage(PICTURE);

        expect(images.getImage()).toBe(PICTURE);
        expect(readFakeStorage<string>(BACKGROUND_IMAGE_KEY)).toBe(PICTURE);
    });

    it("reads back what a previous session stored", async () => {
        seedFakeStorage(BACKGROUND_IMAGE_KEY, PICTURE);

        const reopened = new BackgroundImageRepository();
        await reopened.init();

        expect(reopened.getImage()).toBe(PICTURE);
    });

    it("forgets the picture when it is removed", async () => {
        await images.setImage(PICTURE);
        await images.clear();

        expect(images.getImage()).toBeNull();
        expect(readFakeStorage<string>(BACKGROUND_IMAGE_KEY)).toBeNull();
    });

    it("reads anything stored that is not a picture as no picture", async () => {
        seedFakeStorage(BACKGROUND_IMAGE_KEY, { not: "a data url" });

        const reopened = new BackgroundImageRepository();
        await reopened.init();

        expect(reopened.getImage()).toBeNull();
    });
});
