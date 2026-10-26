import { CLASS_ACTION_ACTIVE } from "../../constants";

/**
 *  "Manage links" in a group's or a subgroup's menu: shows every link's edit and delete
 *  buttons until it is chosen again.
 *
 *  One implementation for both, because two copies are how the subgroup's lost a line: its
 *  menu item never turned active, so nothing in the menu said the mode was on.
 *
 *  @param body     the links' container; it carries `managed` while the mode is on
 *  @param menuItem the menu entry that was chosen; active, and reworded, while the mode is on
 *  @param wording  what the entry says to turn the mode on, and to finish it
 */
export function toggleManageLinksMode(
    body: Element,
    menuItem: HTMLElement,
    wording: { manage: string; finish: string }
): void {
    const managed = body.classList.toggle("managed");
    menuItem.classList.toggle(CLASS_ACTION_ACTIVE, managed);
    // Reworded once the menu has had time to close, so the text does not change under the pointer.
    setTimeout(() => { menuItem.textContent = managed ? wording.finish : wording.manage; }, 250);
}
