import { describe, expect, it } from "vitest";

import {
    GroupSizeRepository, MIN_GROUP_HEIGHT, MIN_GROUP_WIDTH, normalizeGroupSize
} from "../../../src/backend/repository/GroupSizeRepository";
import { GROUP_SIZES_KEY } from "../../../src/backend/datasource/chromeStorage/storageKeys";
import { readFakeStorage, seedFakeStorage } from "../../support/chromeStorageStub";

/** #173: groups resized by hand remember their size on this browser; the rest stay automatic. */
describe("GroupSizeRepository", () => {

    it("has no size for a group nobody resized - it keeps its automatic width", async () => {
        const sizes = new GroupSizeRepository();
        await sizes.init();
        expect(sizes.get("g1")).toBeNull();
    });

    it("keeps a size across pages, and forgets it on reset", async () => {
        const first = new GroupSizeRepository();
        await first.init();
        await first.set("g1", { width: 18.5, height: 30 });

        const second = new GroupSizeRepository();
        await second.init();
        expect(second.get("g1")).toEqual({ width: 18.5, height: 30 });

        await second.forget("g1");
        expect(second.get("g1")).toBeNull();
        expect(readFakeStorage<Record<string, unknown>>(GROUP_SIZES_KEY)).toEqual({});
    });

    it("does not put back what another page changed since it loaded", async () => {
        const stale = new GroupSizeRepository();
        await stale.init();
        const other = new GroupSizeRepository();
        await other.init();
        await other.set("g1", { width: 20, height: 20 });

        await stale.set("g2", { width: 12, height: 12 });

        expect(Object.keys(readFakeStorage<Record<string, unknown>>(GROUP_SIZES_KEY)!).sort()).toEqual(["g1", "g2"]);
    });

    it("drops what it cannot draw and holds the rest to the minimum", async () => {
        seedFakeStorage(GROUP_SIZES_KEY, {
            good: { width: 2, height: 1 }, broken: { width: "wide" }, gone: null
        });
        const sizes = new GroupSizeRepository();
        await sizes.init();

        expect(sizes.get("good")).toEqual({ width: MIN_GROUP_WIDTH, height: MIN_GROUP_HEIGHT });
        expect(sizes.get("broken")).toBeNull();
        expect(sizes.get("gone")).toBeNull();
        expect(normalizeGroupSize({ width: NaN, height: 10 })).toBeNull();
    });
});
