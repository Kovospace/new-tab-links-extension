/**
 *  Lifts a menu into the browser's top layer, above every stacking context on the page (#120).
 *
 *  **Why.** A menu drawn inside the page can rise no higher than the stacking context it sits
 *  in, whatever its own z-index: the application menu opens from the top panel, and the side
 *  panel - a stacking context of its own, at a higher z-index so the top panel's shadow can
 *  fall behind it - covered the menu. An element shown as a popover is drawn in the top layer
 *  instead, which nothing on the page can cover.
 *
 *  **Placed by hand.** The top layer positions against the window, not against the element's
 *  parent, so `top: 100%` under a button no longer means anything there. The menu is placed from
 *  its anchor's rectangle when it opens, and again on every scroll and resize while it is open.
 *
 *  **Manual popovers.** The browser closes an "auto" popover on its own - on any click outside,
 *  on Escape - and the menus already decide that themselves (a click outside also swallows the
 *  click of its press; see `optionsMenu.ts`). Two closers would race; "manual" leaves it to them.
 *
 *  A browser without the Popover API - jsdom, in the tests - keeps the menus where the
 *  stylesheet puts them, exactly as before.
 */

/** Which edge of the anchor the menu lines up with; "stretch" makes it as wide as the anchor. */
export type PopoverAlignment = "start" | "end" | "stretch";

const SUPPORTED = typeof HTMLElement !== "undefined"
    && typeof HTMLElement.prototype.showPopover === "function";

/** The lifted elements that are open now, with what keeps them in place. */
const following = new Map<HTMLElement, () => void>();

/** Marks an element as a popover, once, when it is created. Does nothing without support. */
export function makePopover(element: HTMLElement): void {
    if (SUPPORTED) {
        element.popover = "manual";
    }
}

/**
 *  Shows a popover in the top layer, placed by its anchor, and keeps it there while the page
 *  scrolls or the window resizes. The caller still makes it visible the way its stylesheet asks
 *  (a class, `hidden`); this only lifts and places it.
 *
 *  @param element the popover
 *  @param anchor  what it opens from - the button, the field
 *  @param align   which edge of the anchor it lines up with
 */
export function liftOpen(element: HTMLElement, anchor: HTMLElement, align: PopoverAlignment): void {
    if (!SUPPORTED) {
        return;
    }
    if (!following.has(element)) {
        element.showPopover();
        const place = () => placeBy(element, anchor, align);
        // Capture, because a scroll does not bubble - main is the scroll container, not the window.
        window.addEventListener("scroll", place, { capture: true, passive: true });
        window.addEventListener("resize", place, { passive: true });
        following.set(element, () => {
            window.removeEventListener("scroll", place, { capture: true });
            window.removeEventListener("resize", place);
        });
    }
    placeBy(element, anchor, align);
}

/** Takes a popover out of the top layer again. Safe to call on one that is not open. */
export function liftClosed(element: HTMLElement): void {
    const stopFollowing = following.get(element);
    if (!stopFollowing) {
        return;
    }
    stopFollowing();
    following.delete(element);
    element.hidePopover();
}

/**
 *  Shows a popover at a point - where a right-click happened - rather than by an anchor. It
 *  does not follow scrolling: a context menu is about the spot that was clicked.
 */
export function liftOpenAt(element: HTMLElement): void {
    if (SUPPORTED && !following.has(element)) {
        element.showPopover();
        following.set(element, () => undefined);
    }
}

/** Puts the popover under its anchor, in window coordinates. Margins in the stylesheet still apply. */
function placeBy(element: HTMLElement, anchor: HTMLElement, align: PopoverAlignment): void {
    const rect = anchor.getBoundingClientRect();
    element.style.top = `${rect.bottom}px`;
    element.style.bottom = "auto";
    if (align === "end") {
        element.style.left = "auto";
        element.style.right = `${document.documentElement.clientWidth - rect.right}px`;
    } else {
        element.style.left = `${rect.left}px`;
        element.style.right = "auto";
    }
    element.style.width = align === "stretch" ? `${rect.width}px` : "";
}
