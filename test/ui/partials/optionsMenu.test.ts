import { describe, expect, it, beforeEach, vi } from "vitest";
import { OptionsMenu } from "../../../src/ui/partials/optionsMenu";
import { ELEM_OPTIONS_MENU_ITEM } from "../../../src/constants";

/**
 *  A dangerous menu item - deleting a workspace, a group, a subgroup - is confirmed in the
 *  page's own modal, never in the browser's `confirm()` box, which looked like something other
 *  than this page talking and was titled with the extension's address.
 *
 *  jsdom has no working <dialog>, so showModal and close are stood in for on the prototype;
 *  vitest gives every test file its own environment, so that reaches nothing else.
 */
describe("OptionsMenu", () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        (HTMLDialogElement.prototype as any).showModal = function () { this.open = true; };
        (HTMLDialogElement.prototype as any).close = function () {
            this.open = false; this.dispatchEvent(new Event('close'));
        };
    });

    function menuWithDangerousItem(onClick: () => void): HTMLElement {
        new OptionsMenu(document.body, { openMenuButtonId: "menu" }, [{
            actionTitle: "Delete workspace",
            dangerous: true,
            dangerConfirmation: "Everything in it goes too.",
            onClick
        }]);
        return document.querySelector(ELEM_OPTIONS_MENU_ITEM) as HTMLElement;
    }

    const button = (label: string) => Array.from(document.querySelectorAll('dialog button'))
        .find(b => b.textContent === label) as HTMLButtonElement;
    const settled = () => new Promise(resolve => setTimeout(resolve, 0));

    it("asks in the page's own dialog rather than the browser's confirm box", async () => {
        const nativeConfirm = vi.fn(() => true);
        vi.stubGlobal("confirm", nativeConfirm);
        const onClick = vi.fn();

        menuWithDangerousItem(onClick).click();
        await settled();

        expect(nativeConfirm).not.toHaveBeenCalled();
        const dialog = document.querySelector('dialog.choice-dialog') as HTMLDialogElement;
        expect(dialog.open).toBe(true);
        expect(dialog.textContent).toContain("Everything in it goes too.");
        expect(onClick).not.toHaveBeenCalled();

        button("Delete workspace").click();
        await settled();
        expect(onClick).toHaveBeenCalledOnce();
        vi.unstubAllGlobals();
    });

    it("does nothing when the question is cancelled", async () => {
        const onClick = vi.fn();

        menuWithDangerousItem(onClick).click();
        await settled();
        button("Cancel").click();
        await settled();

        expect(onClick).not.toHaveBeenCalled();
        expect(document.querySelector('dialog')).toBeNull();
    });
});

/**
 *  Pressing outside an open menu closes it, and that is all it does. The overlay that used to
 *  cover the page while a menu was open caught the click; it is gone, so the menu drops the click
 *  of the press that closed it - and only that one.
 */
describe("OptionsMenu, pressing outside it", () => {

    let opened: number;

    beforeEach(() => {
        document.body.innerHTML = '<button id="behind">behind</button><div id="host"></div>';
        opened = 0;
        document.getElementById("behind")!.addEventListener("click", () => opened++);
        new OptionsMenu(document.getElementById("host")!, { openMenuButtonId: "menu" },
            [{ actionTitle: "Rename", onClick: () => undefined }]);
    });

    const menu = () => document.querySelector("options-menu")!;
    const behind = () => document.getElementById("behind")!;
    /** A real press: mousedown, mouseup, click - in that order, as the browser sends them. */
    const press = (target: Element) => {
        target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
        target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    };
    const tick = () => new Promise(resolve => setTimeout(resolve, 0));

    it("closes the menu without the click reaching what was under the pointer", async () => {
        (document.getElementById("menu") as HTMLButtonElement).click();
        expect(menu().classList.contains("visible")).toBe(true);

        press(behind());
        await tick();

        expect(menu().classList.contains("visible")).toBe(false);
        expect(opened).toBe(0);
    });

    it("lets the next click through, and every click while no menu is open", async () => {
        (document.getElementById("menu") as HTMLButtonElement).click();
        press(behind());
        await tick();

        press(behind());
        await tick();
        press(behind());

        expect(opened).toBe(2);
    });

    it("eats no later click when the press that closed the menu ended without one", async () => {
        (document.getElementById("menu") as HTMLButtonElement).click();
        behind().dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        behind().dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));   // dragged away: no click
        await tick();

        press(behind());

        expect(opened).toBe(1);
    });
});
