import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 *  Menus open in the browser's top layer (#120), so no stacking context on the page - the side
 *  panel's, above all - can cover them. jsdom has no Popover API: it is stood in for on the
 *  prototype before the modules load, which is safe only because vitest gives every test file
 *  its own environment. The modules are loaded fresh each time, since popover.ts decides at load
 *  whether the browser can do it.
 */
describe("menus as popovers", () => {

    let shown: Element[];
    let hidden: Element[];

    beforeEach(() => {
        vi.resetModules();
        shown = [];
        hidden = [];
        const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
        proto.showPopover = function (this: Element) { shown.push(this); };
        proto.hidePopover = function (this: Element) { hidden.push(this); };
        document.body.innerHTML = '<div id="host"></div><main id="elsewhere"></main>';
    });

    /** A menu whose button sits at a given place in a 1000px wide window. */
    async function menuWithButtonAt(left: number): Promise<{ button: HTMLElement; menu: HTMLElement }> {
        const { OptionsMenu } = await import("../../../src/ui/partials/optionsMenu");
        new OptionsMenu(document.getElementById("host")!, { openMenuButtonId: "app-menu" },
            [{ actionTitle: "Settings", onClick: () => undefined }]);
        const button = document.getElementById("app-menu")!;
        button.getBoundingClientRect = () =>
            ({ left, right: left + 40, top: 10, bottom: 50, width: 40, height: 40 }) as DOMRect;
        Object.defineProperty(document.documentElement, "clientWidth", { value: 1000, configurable: true });
        Object.defineProperty(window, "innerWidth", { value: 1000, configurable: true });
        return { button, menu: document.querySelector("options-menu") as HTMLElement };
    }

    it("is a manual popover, shown in the top layer under its button", async () => {
        const { button, menu } = await menuWithButtonAt(100);

        button.click();

        expect((menu as unknown as { popover: string }).popover).toBe("manual");
        expect(shown).toEqual([menu]);
        expect(menu.style.top).toBe("50px");
        expect(menu.style.left).toBe("100px");
        expect(menu.style.right).toBe("auto");
    });

    it("opens leftwards from its button's right edge in the right half of the window", async () => {
        const { button, menu } = await menuWithButtonAt(900);

        button.click();

        expect(menu.style.left).toBe("auto");
        expect(menu.style.right).toBe("60px");      // 1000 - (900 + 40)
    });

    it("leaves the top layer when closed by its button or by a press outside", async () => {
        const { button, menu } = await menuWithButtonAt(100);

        // Menus left open by earlier tests in this file still hear the page; only this one counts.
        const ofThisMenu = (list: Element[]) => list.filter(element => element === menu);

        button.click();
        button.click();
        expect(ofThisMenu(hidden)).toEqual([menu]);

        button.click();
        const elsewhere = document.getElementById("elsewhere")!;
        elsewhere.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        elsewhere.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
        expect(ofThisMenu(hidden)).toEqual([menu, menu]);
        expect(ofThisMenu(shown)).toEqual([menu, menu]);
    });

    it("follows its button while the page scrolls, and stops once closed", async () => {
        const { button, menu } = await menuWithButtonAt(100);
        button.click();

        button.getBoundingClientRect = () =>
            ({ left: 100, right: 140, top: -20, bottom: 20, width: 40, height: 40 }) as DOMRect;
        window.dispatchEvent(new Event("scroll"));
        expect(menu.style.top).toBe("20px");

        button.click();
        button.getBoundingClientRect = () =>
            ({ left: 100, right: 140, top: 200, bottom: 240, width: 40, height: 40 }) as DOMRect;
        window.dispatchEvent(new Event("scroll"));
        expect(menu.style.top).toBe("20px");
    });

    it("puts the right-click menu in the top layer too", async () => {
        const { contextMenu } = await import("../../../src/ui/partials/contextMenu");

        contextMenu.show(30, 40, [{ label: "Open", onClick: () => undefined }]);
        const menu = document.body.querySelector(":scope > options-menu") as HTMLElement;
        expect(shown).toEqual([menu]);

        contextMenu.hide();
        expect(hidden).toEqual([menu]);
    });
});
