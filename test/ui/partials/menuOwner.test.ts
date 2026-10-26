import { beforeEach, describe, expect, it, vi } from "vitest";

import { OptionsMenu } from "../../../src/ui/partials/optionsMenu";
import { contextMenu } from "../../../src/ui/partials/contextMenu";
import { CLASS_HAS_OPEN_MENU, ELEM_OPTIONS_MENU_ITEM } from "../../../src/constants";

/**
 *  A link, group or subgroup keeps its hover look while a menu opened from it is open. The
 *  menus sit in the top layer, so the pointer leaves the element for the menu - and nothing
 *  on the page said any more which element the menu was about. The stylesheets give the
 *  marked element the hover look; what is checked here is that the mark comes and goes.
 */
describe("the element a menu is about", () => {

    let owner: HTMLElement;
    const marked = () => owner.classList.contains(CLASS_HAS_OPEN_MENU);

    beforeEach(() => {
        // Everything but the right-click menu, which is one element for the whole page, kept.
        Array.from(document.body.children)
            .filter(child => child.localName !== "options-menu")
            .forEach(child => child.remove());
        owner = document.createElement("link-group");
        document.body.appendChild(owner);
    });

    describe("options menu", () => {

        function menu(onClick = vi.fn()) {
            new OptionsMenu(owner, { openMenuButtonId: "menu", owner }, [
                { actionTitle: "Rename", onClick }
            ]);
            return document.getElementById("menu") as HTMLButtonElement;
        }

        it("is marked while the menu is open, and unmarked when it closes again", () => {
            const button = menu();

            button.click();
            expect(marked()).toBe(true);

            button.click();
            expect(marked()).toBe(false);
        });

        it("is unmarked when something outside the menu is pressed", async () => {
            menu().click();

            // A whole press: the menu swallows the click that belongs to it until the mouseup.
            document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
            document.body.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(marked()).toBe(false);
        });

        it("is unmarked when an entry is chosen", () => {
            const onClick = vi.fn();
            menu(onClick).click();

            (document.querySelector(ELEM_OPTIONS_MENU_ITEM) as HTMLElement).click();

            expect(onClick).toHaveBeenCalledOnce();
            expect(marked()).toBe(false);
        });

        it("marks nothing for a menu that names no element, such as the header's", () => {
            new OptionsMenu(document.body, { openMenuButtonId: "app-menu" }, [
                { actionTitle: "Settings", onClick: vi.fn() }
            ]);

            (document.getElementById("app-menu") as HTMLButtonElement).click();

            expect(document.querySelector(`.${CLASS_HAS_OPEN_MENU}`)).toBeNull();
        });
    });

    describe("right-click menu", () => {

        it("is marked while the menu is open, and unmarked when it hides", () => {
            contextMenu.show(10, 10, [{ label: "Delete", onClick: vi.fn() }], owner);
            expect(marked()).toBe(true);

            contextMenu.hide();
            expect(marked()).toBe(false);
        });

        it("hands the mark over when the menu is opened on another element", () => {
            const other = document.createElement("link-container");
            document.body.appendChild(other);
            contextMenu.show(10, 10, [{ label: "Delete", onClick: vi.fn() }], owner);

            contextMenu.show(20, 20, [{ label: "Delete", onClick: vi.fn() }], other);

            expect(marked()).toBe(false);
            expect(other.classList.contains(CLASS_HAS_OPEN_MENU)).toBe(true);
            contextMenu.hide();
        });

        it("is unmarked when an entry is chosen", () => {
            contextMenu.show(10, 10, [{ label: "Delete", onClick: vi.fn() }], owner);

            (document.querySelector(`${ELEM_OPTIONS_MENU_ITEM}`) as HTMLElement).click();

            expect(marked()).toBe(false);
        });
    });
});
