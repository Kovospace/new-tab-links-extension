import { describe, expect, it, vi } from "vitest";
import { PageReloads } from "../../src/utils/pageReload";

describe("PageReloads", () => {

    it("reloads at once when nothing holds the page", () => {
        const reload = vi.fn();
        new PageReloads(reload).request();
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it("keeps a reload asked for under a hold until the last hold is released", () => {
        const reload = vi.fn();
        const reloads = new PageReloads(reload);
        const first = reloads.hold();
        const second = reloads.hold();

        reloads.request();
        reloads.request();
        first();
        expect(reload).not.toHaveBeenCalled();

        second();
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it("does not reload on release when nothing asked for it", () => {
        const reload = vi.fn();
        new PageReloads(reload).hold()();
        expect(reload).not.toHaveBeenCalled();
    });

    it("releases a hold only once, however often its release is called", () => {
        const reload = vi.fn();
        const reloads = new PageReloads(reload);
        const outer = reloads.hold();
        const inner = reloads.hold();
        inner();
        inner();

        reloads.request();
        expect(reload).not.toHaveBeenCalled();
        outer();
        expect(reload).toHaveBeenCalledTimes(1);
    });
});
