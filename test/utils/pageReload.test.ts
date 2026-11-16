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

/**
 *  The first fix for #210 held the reloads in `main.ts` and missed the one in
 *  `WorkspaceViewModel`, which reloaded the page outright the moment sign-in removed the
 *  starter, while the sign-in dialog was still open - so the device-name question never came.
 *  A hold that some reload ignores does not do its job, so every reload goes through it.
 */
describe("reloading the page", () => {

    it("goes through pageReloads everywhere, never straight to the window", async () => {
        const { readdirSync, readFileSync, statSync } = await import("node:fs");
        const { join, relative } = await import("node:path");
        const root = join(__dirname, "../../src");
        const offenders: string[] = [];
        const visit = (dir: string): void => {
            for (const entry of readdirSync(dir)) {
                const path = join(dir, entry);
                if (statSync(path).isDirectory()) {
                    visit(path);
                } else if (path.endsWith(".ts") && /location\.reload\s*\(/.test(readFileSync(path, "utf8"))) {
                    offenders.push(relative(root, path));
                }
            }
        };
        visit(root);

        expect(offenders).toEqual(["utils/pageReload.ts"]);
    });
});
