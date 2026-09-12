import { profileRepository, ProfileRepository } from "../../backend/repository/ProfileRepository";
import { settingsOf } from "../../backend/entity/ProfileSettings";
import { Logger } from "../../utils/logger";

/**
 *  Dragging things about: who may be picked up, what may be dropped where, and whether any of
 *  it is switched on.
 *
 *  **HTML5 drag and drop rather than pointer arithmetic.** The browser already knows how to
 *  carry something under the cursor, how to draw it while it travels, when a drag has been
 *  abandoned, and what a touch screen means by all of that. Rewriting it from mousedown would
 *  be a week of work to arrive back where the platform started.
 *
 *  **Everything is registered, and the setting is read when the drag begins.** The alternative
 *  - adding and removing listeners as the setting changes - means every component has to hear
 *  about the change and find its own elements again. A drag that starts while the setting is
 *  off is simply refused, which is one comparison in one place.
 *
 *  What is dragged is named rather than serialised: `dataTransfer` carries an identifier and a
 *  kind, and the drop looks the rest up. A dragged link is a link in this page's own state, not
 *  a payload to be reconstructed from a string.
 */

const LOG = new Logger("DragAndDrop");

/** What is being carried. */
export type DragKind = "link" | "subgroup" | "group" | "closedTab";

/** What a target will take: one kind, or any of several. */
export type Accepts = DragKind | DragKind[];

/**
 *  The thing under the cursor, while there is one.
 *
 *  A link, a subgroup and a group are named by identifier and looked up where they land: they
 *  exist, and the drop is a move. A closed tab is not a link anywhere yet - dropping one makes
 *  one - so it carries what a link would need to be made of, and the target that receives it
 *  never has to reach into the panel it came from.
 */
export type Dragged =
    | { kind: "link" | "subgroup" | "group"; id: string }
    | { kind: "closedTab"; id: string; url: string; title: string };

/** Where a drop would put it, relative to the element under the cursor. */
export type DropSide = "before" | "after";

/** The classes the stylesheet draws the drag with. */
const CLASS_DRAGGING = "dnd-dragging";

/**
 *  Put on the root element while anything is being dragged.
 *
 *  The stylesheet uses it to take the pointer away from the decorations inside a drop target -
 *  a heading, a description, a favicon. They are not targets and never were, but while a drag
 *  is in flight they are what the pointer lands on, which fires dragleave on the target the
 *  moment the cursor reaches the text inside it and a dragenter that nothing has cancelled.
 *  With the children transparent, a head is one target from edge to edge.
 */
const CLASS_DRAG_IN_FLIGHT = "dnd-active";

/**
 *  Names what is being carried, on the root element, beside the class above.
 *
 *  The class says only that a drag is happening, which is all the pointer-events rule needs.
 *  It is not enough for a rule about one kind of drag: the closed tabs panel holds its width
 *  while a row is dragged out of it, because it is the source and one that narrowed under the
 *  cursor would take the row out from under the thing being carried - and keyed on the class
 *  alone that rule unfolded the panel on every link, subgroup and group drag as well.
 */
const ATTRIBUTE_DRAG_KIND = "dndKind";
const CLASS_OVER_BEFORE = "dnd-over-before";
const CLASS_OVER_AFTER = "dnd-over-after";
const CLASS_OVER_INTO = "dnd-over-into";

/**
 *  How far from the left edge of the thing being carried the cursor is allowed to sit, in ems
 *  of the root font size - which is the UI size setting, so this grows with everything else.
 *
 *  A wide row grabbed by its right end put the cursor a long way to the right of where the row
 *  was drawn, and a link is as wide as the column it lives in: the cursor was then outside the
 *  column while the row floated over it. The drop still landed where it looked like it would,
 *  because the browser hit-tests the cursor and the column next door forwarded nothing - but
 *  the line showing where it would land is drawn inside the column, and there was nothing under
 *  the cursor to draw it on. Nothing said where the thing was about to go.
 */
const GRAB_LIMIT_EM = 2;

/**
 *  What is being dragged right now, or null.
 *
 *  Module state rather than something passed through `dataTransfer` alone, because the data a
 *  drag carries is not readable during `dragover` - only its types are - and every decision
 *  about whether a drop is allowed has to be made there.
 */
let dragged: Dragged | null = null;

/** The profile registry, which is where the setting lives; injectable for testing. */
let profiles: ProfileRepository = profileRepository;

/** Points this at another registry. Used by tests, which have no singletons. */
export function useProfilesForDragAndDrop(repository: ProfileRepository): void {
    profiles = repository;
}

/** Whether the profile has dragging switched on. */
export function isDragAndDropEnabled(): boolean {
    return settingsOf(
        profiles.getProfiles().find(profile => profile.id === profiles.getActiveProfileId())
    ).enableDragAndDrop;
}

/** What is under the cursor right now, for a drop target deciding whether to accept it. */
export function whatIsBeingDragged(): Dragged | null {
    return dragged;
}

/**
 *  Lets an element be picked up.
 *
 *  @param element the element to drag
 *  @param what    what it stands for
 */
export function makeDraggable(element: HTMLElement, what: Dragged): void {

    element.draggable = true;

    // Anchors and images drag themselves by default - a URL or a picture, out of the page -
    // and one inside a draggable element takes the drag over, so the element around it can
    // only be picked up by the parts they do not cover. What is registered here is the thing
    // being dragged, so nothing inside it may claim the gesture. Elements drawn later say so
    // themselves, where they are created.
    element.querySelectorAll("a, img").forEach(child => {
        (child as HTMLElement).draggable = false;
    });

    element.addEventListener("dragstart", event => {
        if (!isDragAndDropEnabled()) {
            // Registered but switched off: refusing here rather than never listening means the
            // setting can be turned on without anything being rebuilt.
            event.preventDefault();
            return;
        }
        // The innermost draggable claims the drag. A link sits inside a group and both are
        // draggable, and dragstart bubbles - so without this the group's handler ran after
        // the link's and overwrote what was being carried. Every link drag became a group
        // drag, which is precisely as destructive as it sounds.
        event.stopPropagation();

        dragged = what;
        anchorGhostToCursor(element, event, what.kind);
        element.classList.add(CLASS_DRAGGING);
        document.documentElement.classList.add(CLASS_DRAG_IN_FLIGHT);
        document.documentElement.dataset[ATTRIBUTE_DRAG_KIND] = what.kind;
        // A type the drop targets can recognise before they are allowed to read the data, and
        // a plain text fallback so dragging out of the page does something sensible.
        event.dataTransfer?.setData(`application/x-ntl-${what.kind}`, what.id);
        event.dataTransfer?.setData("text/plain", what.id);
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = "move";
        }
        LOG.debug("dragstart", `${what.kind} ${what.id}`);
    });

    element.addEventListener("dragend", event => {
        // Bubbles like dragstart, and for the same reason is claimed by the element the drag
        // actually started on.
        event.stopPropagation();
        dragged = null;
        element.classList.remove(CLASS_DRAGGING);
        document.documentElement.classList.remove(CLASS_DRAG_IN_FLIGHT);
        delete document.documentElement.dataset[ATTRIBUTE_DRAG_KIND];
        clearMarks();
    });
}

/**
 *  Lets something be dropped onto an element, before it or after it.
 *
 *  Which of the two is decided by where in the element the cursor is: the nearer half wins.
 *  That is the convention everything else in a browser uses for reordering, and it means the
 *  whole element is a target rather than a one-pixel line between two of them.
 *
 *  @param element  the element being dropped onto
 *  @param accepts  what this element will take
 *  @param onDrop   what to do, given which side of the element the cursor was on
 */
export function makeReorderTarget(
    element: HTMLElement,
    accepts: Accepts,
    onDrop: (side: DropSide, draggedId: string) => void
): void {

    // dragenter as well as dragover, because both have to be cancelled for a drop to be
    // allowed. Chrome usually forgives a missing dragenter - until the drag enters a child
    // element the target did not know about, where the uncancelled default is what decides,
    // and the drop is refused over that child alone.
    const allow = (event: DragEvent): boolean => {
        const carrying = acceptable(accepts);
        if (!carrying || carrying.id === identityOf(element)) {
            return false;
        }
        event.preventDefault();
        // The innermost target under the cursor is the one being aimed at: a link inside a
        // subgroup inside a group would otherwise light all three up at once, and the drop
        // would read as "into the group" while the line was drawn beside the link.
        event.stopPropagation();
        return true;
    };

    element.addEventListener("dragenter", event => {
        allow(event);
    });

    element.addEventListener("dragover", event => {
        const carrying = acceptable(accepts);
        if (!allow(event)) {
            return;
        }
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = "move";
        }
        mark(element, sideOf(element, event, carrying!.kind) === "before"
            ? CLASS_OVER_BEFORE
            : CLASS_OVER_AFTER);
    });

    element.addEventListener("dragleave", () => unmark(element));

    element.addEventListener("drop", event => {
        const carrying = acceptable(accepts);
        if (!carrying || carrying.id === identityOf(element)) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        unmark(element);
        onDrop(sideOf(element, event, carrying.kind), carrying.id);
    });
}

/**
 *  Lets something be dropped *into* an element - a subgroup, or a group's own body.
 *
 *  A container has no "before" and "after" worth speaking of: dropping on it means "put it in
 *  here", at the end, which is where somebody dropping onto empty space expects it to go.
 *
 *  @param element the container
 *  @param accepts what it will take
 *  @param onDrop  what to do with it
 */
export function makeContainerTarget(
    element: HTMLElement,
    accepts: Accepts,
    onDrop: (draggedId: string) => void
): void {

    // Both, for the reason above: a drop is allowed only where dragenter and dragover have
    // each been cancelled, and a child the target did not know about is where that bites.
    const allow = (event: DragEvent): boolean => {
        if (!acceptable(accepts)) {
            return false;
        }
        event.preventDefault();
        // The innermost container claims it, as the innermost reorder target does. A
        // subgroup sits inside a group and both take links; without this both lit up.
        event.stopPropagation();
        return true;
    };

    element.addEventListener("dragenter", event => {
        allow(event);
    });

    element.addEventListener("dragover", event => {
        if (!allow(event)) {
            return;
        }
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = "move";
        }
        mark(element, CLASS_OVER_INTO);
    });

    element.addEventListener("dragleave", () => unmark(element));

    element.addEventListener("drop", event => {
        const carrying = acceptable(accepts);
        if (!carrying) {
            return;
        }
        event.preventDefault();
        // Stopped, and this is the fix for a link dropped on a subgroup's heading landing in
        // the group instead of the subgroup: a subgroup is inside a group, both take links,
        // and an unstopped drop reached the group's handler afterwards - the outer one ran
        // last and won. A drop on a link inside this container has already stopped before
        // here, so reaching this line means the container itself was the target.
        event.stopPropagation();
        unmark(element);
        onDrop(carrying.id);
    });
}

/**
 *  Redraws the thing under the cursor so the cursor is near its leading edge.
 *
 *  Only sideways, and only for what is stacked vertically. There the cursor's x means nothing
 *  to a drop - the side is decided by y - so moving the picture under it costs nothing and buys
 *  a cursor that stays inside the column it is aiming at. A group is the exception: its
 *  siblings are columns, x is precisely what decides where it lands, and shifting it would be
 *  moving the very thing being aimed with.
 */
function anchorGhostToCursor(element: HTMLElement, event: DragEvent, kind: DragKind): void {
    if (kind === "group" || typeof event.dataTransfer?.setDragImage !== "function") {
        return;
    }
    const box = element.getBoundingClientRect();
    const grabbedAtY = event.clientY - box.top;
    const grabbedAtX = event.clientX - box.left;
    const limit = rootFontSize() * GRAB_LIMIT_EM;
    if (grabbedAtX <= limit) {
        // Grabbed near the leading edge already; leaving the picture where it was drawn is
        // less startling than nudging it.
        return;
    }
    event.dataTransfer.setDragImage(element, limit, grabbedAtY);
}

/** The root font size in pixels, which is what an em of the page measures. */
function rootFontSize(): number {
    const size = parseFloat(getComputedStyle(document.documentElement).fontSize);
    return Number.isFinite(size) && size > 0 ? size : 16;
}

/**
 *  Which half of an element the cursor is in.
 *
 *  Vertically for a link, whose siblings are stacked; horizontally for a group, whose siblings
 *  are columns side by side. Dragging one of those upwards and expecting it to change column
 *  would be a strange thing to expect.
 */
export function sideOf(element: HTMLElement, event: MouseEvent, kind: DragKind): DropSide {
    const box = element.getBoundingClientRect();
    // Groups are columns side by side; everything else is stacked within one.
    return kind === "group"
        ? (event.clientX < box.left + box.width / 2 ? "before" : "after")
        : (event.clientY < box.top + box.height / 2 ? "before" : "after");
}

/** What is being dragged, if this target takes that kind and dragging is on at all. */
function acceptable(accepts: Accepts): Dragged | null {
    const kinds = Array.isArray(accepts) ? accepts : [accepts];
    if (!isDragAndDropEnabled() || !dragged || !kinds.includes(dragged.kind)) {
        return null;
    }
    return dragged;
}

/** The identifier of whatever an element stands for; components set `id` to it. */
function identityOf(element: HTMLElement): string {
    return element.id;
}

function mark(element: HTMLElement, className: string): void {
    if (!element.classList.contains(className)) {
        unmark(element);
        element.classList.add(className);
    }
}

function unmark(element: HTMLElement): void {
    element.classList.remove(CLASS_OVER_BEFORE, CLASS_OVER_AFTER, CLASS_OVER_INTO);
}

/** Takes every mark off the page, for a drag that ended anywhere at all. */
function clearMarks(): void {
    document
        .querySelectorAll(`.${CLASS_OVER_BEFORE}, .${CLASS_OVER_AFTER}, .${CLASS_OVER_INTO}`)
        .forEach(element => element.classList.remove(
            CLASS_OVER_BEFORE, CLASS_OVER_AFTER, CLASS_OVER_INTO));
}
