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
        document.body.innerHTML = '<div class="overlay hidden"></div>';
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
