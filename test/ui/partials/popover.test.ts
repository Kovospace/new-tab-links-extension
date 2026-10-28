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

    /**
     *  #157: a group's menu at the foot of a long column ran off the bottom of the window. The
     *  window here is 800px tall and the menu 300px; jsdom lays nothing out, so both are given.
     */
    describe("kept on screen", () => {

        async function menuOfHeight(height: number, button: { top: number; left?: number }) {
            const { button: opener, menu } = await menuWithButtonAt(button.left ?? 100);
            Object.defineProperty(document.documentElement, "clientHeight", { value: 800, configurable: true });
            const left = button.left ?? 100;
            opener.getBoundingClientRect = () => ({
                left, right: left + 40, top: button.top, bottom: button.top + 40, width: 40, height: 40
            }) as DOMRect;
            menu.getBoundingClientRect = () => ({ width: 200, height }) as DOMRect;
            return { opener, menu };
        }

        it("opens under its button where it fits", async () => {
            const { opener, menu } = await menuOfHeight(300, { top: 100 });

            opener.click();

            expect(menu.style.top).toBe("140px");
            expect(menu.style.bottom).toBe("auto");
            expect(menu.style.maxHeight).toBe("");
        });

        it("opens above its button when it would run off the bottom", async () => {
            const { opener, menu } = await menuOfHeight(300, { top: 650 });

            opener.click();

            expect(menu.style.top).toBe("auto");
            expect(menu.style.bottom).toBe("150px");     // 800 - 650: its bottom at the button's top
            expect(menu.style.maxHeight).toBe("");
        });

        it("takes the side with more room and scrolls when it fits neither", async () => {
            const { opener, menu } = await menuOfHeight(700, { top: 500 });

            opener.click();

            expect(menu.style.bottom).toBe("300px");
            expect(menu.style.maxHeight).toBe("500px");
            expect(menu.style.overflowY).toBe("auto");
        });

        it("goes back under its button once the page has scrolled room for it", async () => {
            const { opener, menu } = await menuOfHeight(300, { top: 650 });
            opener.click();

            opener.getBoundingClientRect = () =>
                ({ left: 100, right: 140, top: 100, bottom: 140, width: 40, height: 40 }) as DOMRect;
            window.dispatchEvent(new Event("scroll"));

            expect(menu.style.top).toBe("140px");
            expect(menu.style.bottom).toBe("auto");
        });

        it("lines up with the other edge of its button when it would run off the side", async () => {
            // In the left half of a 1000px window, so the menu asks for its button's left edge;
            // the page is only 600px wide, and 200px from 450 would pass it.
            const { opener, menu } = await menuOfHeight(100, { top: 100, left: 450 });
            Object.defineProperty(document.documentElement, "clientWidth", { value: 600, configurable: true });

            opener.click();

            expect(menu.style.left).toBe("auto");
            expect(menu.style.right).toBe("110px");      // 600 - (450 + 40)
        });
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
