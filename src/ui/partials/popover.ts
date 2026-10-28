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

/**
 *  Puts the popover by its anchor, in window coordinates, and keeps it on screen (#157).
 *
 *  Under the anchor when it fits there, as the context menu goes right of and below the
 *  click when it fits there; otherwise above it. A group's menu at the bottom of a long
 *  column used to run off the screen, with no way to reach its last items. When it fits
 *  neither way it takes the side with more room and scrolls within it. Sideways the same:
 *  aligned with the other edge of the anchor when the asked-for one would run off.
 *
 *  Measured afresh every time - it is placed again on every scroll, and a menu that had to be
 *  flipped near the bottom of the window may fit under its button once the page has scrolled.
 *  The stylesheet's gap between the anchor and the menu is its top margin; above, it becomes
 *  the bottom one.
 */
function placeBy(element: HTMLElement, anchor: HTMLElement, align: PopoverAlignment): void {
    const rect = anchor.getBoundingClientRect();
    element.style.width = align === "stretch" ? `${rect.width}px` : "";
    element.style.maxHeight = "";
    element.style.overflowY = "";
    element.style.marginTop = "";
    element.style.marginBottom = "";
    placeSideways(element, rect, align);
    element.style.top = `${rect.bottom}px`;
    element.style.bottom = "auto";
    placeVertically(element, rect);
}

/** Lines the popover up with the asked-for edge of the anchor, or the other one if that runs off. */
function placeSideways(element: HTMLElement, anchor: DOMRect, align: PopoverAlignment): void {
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const width = element.getBoundingClientRect().width;
    let alignment = align;
    if (align === "start" && width > 0 && anchor.left + width > viewportWidth && anchor.right - width >= 0) {
        alignment = "end";
    } else if (align === "end" && width > 0 && anchor.right - width < 0 && anchor.left + width <= viewportWidth) {
        alignment = "start";
    }
    if (alignment === "end") {
        element.style.left = "auto";
        element.style.right = `${viewportWidth - anchor.right}px`;
    } else {
        element.style.left = `${anchor.left}px`;
        element.style.right = "auto";
    }
}

/** Moves the popover above the anchor when it does not fit under it, and caps it where neither fits. */
function placeVertically(element: HTMLElement, anchor: DOMRect): void {
    const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
    const height = element.getBoundingClientRect().height;
    if (height === 0 || viewportHeight === 0) {
        return;     // not laid out - nothing to measure
    }
    const gap = parseFloat(getComputedStyle(element).marginTop) || 0;
    const roomBelow = viewportHeight - anchor.bottom - gap;
    const roomAbove = anchor.top - gap;

    if (height <= roomBelow || roomBelow >= roomAbove) {
        if (height > roomBelow) {
            capAt(element, roomBelow);
        }
        return;
    }
    element.style.top = "auto";
    element.style.bottom = `${viewportHeight - anchor.top}px`;
    element.style.marginTop = "0";
    element.style.marginBottom = `${gap}px`;
    if (height > roomAbove) {
        capAt(element, roomAbove);
    }
}

/** Fits the popover into the room there is, scrolling what does not fit. */
function capAt(element: HTMLElement, room: number): void {
    element.style.maxHeight = `${Math.max(room, 0)}px`;
    element.style.overflowY = "auto";
}
