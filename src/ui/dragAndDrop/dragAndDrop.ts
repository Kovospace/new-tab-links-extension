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
export type DragKind = "link" | "group";

/** The thing under the cursor, while there is one. */
export interface Dragged {
    kind: DragKind;
    id: string;
}

/** Where a drop would put it, relative to the element under the cursor. */
export type DropSide = "before" | "after";

/** The classes the stylesheet draws the drag with. */
const CLASS_DRAGGING = "dnd-dragging";
const CLASS_OVER_BEFORE = "dnd-over-before";
const CLASS_OVER_AFTER = "dnd-over-after";
const CLASS_OVER_INTO = "dnd-over-into";

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
        element.classList.add(CLASS_DRAGGING);
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
    accepts: DragKind,
    onDrop: (side: DropSide, draggedId: string) => void
): void {

    element.addEventListener("dragover", event => {
        const carrying = acceptable(accepts);
        if (!carrying || carrying.id === identityOf(element)) {
            return;
        }
        event.preventDefault();
        // The innermost target under the cursor is the one being aimed at: a link inside a
        // subgroup inside a group would otherwise light all three up at once, and the drop
        // would read as "into the group" while the line was drawn beside the link.
        event.stopPropagation();
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = "move";
        }
        mark(element, sideOf(element, event, accepts) === "before"
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
        onDrop(sideOf(element, event, accepts), carrying.id);
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
    accepts: DragKind,
    onDrop: (draggedId: string) => void
): void {

    element.addEventListener("dragover", event => {
        if (!acceptable(accepts)) {
            return;
        }
        event.preventDefault();
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
        // Not stopped: a drop on a link inside this container has already stopped it, so
        // reaching here means the container itself was the target.
        unmark(element);
        onDrop(carrying.id);
    });
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
    return kind === "group"
        ? (event.clientX < box.left + box.width / 2 ? "before" : "after")
        : (event.clientY < box.top + box.height / 2 ? "before" : "after");
}

/** What is being dragged, if this target takes that kind and dragging is on at all. */
function acceptable(accepts: DragKind): Dragged | null {
    if (!isDragAndDropEnabled() || !dragged || dragged.kind !== accepts) {
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
