import { beforeEach, describe, expect, it } from "vitest";

import { ProfileRepository } from "../../../src/backend/repository/ProfileRepository";
import {
    isDragAndDropEnabled, makeContainerTarget, makeDraggable, makeReorderTarget, sideOf,
    useProfilesForDragAndDrop, whatIsBeingDragged
} from "../../../src/ui/dragAndDrop/dragAndDrop";

/** jsdom lays nothing out, so an element is told where it is. */
function boxOf(element: HTMLElement, box: Partial<DOMRect>): void {
    element.getBoundingClientRect = () => ({
        left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100, x: 0, y: 0,
        toJSON: () => ({}), ...box
    }) as DOMRect;
}

/** A drag event jsdom will carry, with the dataTransfer a browser would provide. */
/** Every setDragImage the last drag asked for; emptied before each test. */
const drawnAt: { image: Element; x: number; y: number }[] = [];

function dragEvent(type: string, at: { clientX?: number; clientY?: number } = {}): DragEvent {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, ...at }) as DragEvent;
    const data = new Map<string, string>();
    Object.defineProperty(event, "dataTransfer", {
        value: {
            setData: (format: string, value: string) => data.set(format, value),
            getData: (format: string) => data.get(format) ?? "",
            setDragImage: (image: Element, x: number, y: number) => {
                drawnAt.push({ image, x, y });
            },
            effectAllowed: "", dropEffect: ""
        }
    });
    return event;
}

describe("dragAndDrop", () => {

    let profiles: ProfileRepository;

    beforeEach(async () => {
        document.body.innerHTML = "";
        drawnAt.length = 0;
        profiles = new ProfileRepository();
        await profiles.init();
        useProfilesForDragAndDrop(profiles);
    });

    /**
     *  The setting is read when a drag begins rather than when the listeners are attached, so
     *  that turning it on takes effect without anything being rebuilt - and so that turning it
     *  off stops the next drag rather than the page having to be reloaded.
     */
    describe("the setting", () => {

        it("is switched on for a profile that never said otherwise", () => {
            expect(isDragAndDropEnabled()).toBe(true);
        });

        it("refuses to start a drag while dragging is switched off", async () => {
            await profiles.updateSettings({ enableDragAndDrop: false });
            const element = document.createElement("div");
            makeDraggable(element, { kind: "link", id: "a" });

            const started = element.dispatchEvent(dragEvent("dragstart"));

            expect(isDragAndDropEnabled()).toBe(false);
            expect(whatIsBeingDragged()).toBeNull();
            // preventDefault, which is how a dragstart is refused.
            expect(started).toBe(false);
        });

        it("carries the thing once it is switched on", async () => {
            await profiles.updateSettings({ enableDragAndDrop: true });
            const element = document.createElement("div");
            makeDraggable(element, { kind: "link", id: "a" });

            element.dispatchEvent(dragEvent("dragstart"));

            expect(whatIsBeingDragged()).toEqual({ kind: "link", id: "a" });
        });

        it("is claimed by the innermost thing, not the box around it", async () => {
            // The bug: a link lives inside a group and both can be dragged, and dragstart
            // bubbles - so the group's handler ran after the link's and overwrote what was
            // being carried. Every attempt to drag a link moved a whole column instead.
            await profiles.updateSettings({ enableDragAndDrop: true });

            const group = document.createElement("div");
            const link = document.createElement("div");
            group.appendChild(link);
            document.body.appendChild(group);
            makeDraggable(group, { kind: "group", id: "the-group" });
            makeDraggable(link, { kind: "link", id: "the-link" });

            link.dispatchEvent(dragEvent("dragstart"));

            expect(whatIsBeingDragged()).toEqual({ kind: "link", id: "the-link" });
        });

        it("still carries the group when the group itself is dragged", async () => {
            await profiles.updateSettings({ enableDragAndDrop: true });

            const group = document.createElement("div");
            const link = document.createElement("div");
            group.appendChild(link);
            document.body.appendChild(group);
            makeDraggable(group, { kind: "group", id: "the-group" });
            makeDraggable(link, { kind: "link", id: "the-link" });

            group.dispatchEvent(dragEvent("dragstart"));

            expect(whatIsBeingDragged()).toEqual({ kind: "group", id: "the-group" });
        });

        it("lets go at the end of the drag", async () => {
            await profiles.updateSettings({ enableDragAndDrop: true });
            const element = document.createElement("div");
            makeDraggable(element, { kind: "link", id: "a" });

            element.dispatchEvent(dragEvent("dragstart"));
            element.dispatchEvent(dragEvent("dragend"));

            expect(whatIsBeingDragged()).toBeNull();
        });
    });

    describe("which side of a thing the cursor is on", () => {

        it("reads a link up and down, because links are stacked", () => {
            const link = document.createElement("div");
            boxOf(link, { top: 100, bottom: 140, height: 40 });

            expect(sideOf(link, dragEvent("dragover", { clientY: 110 }), "link")).toBe("before");
            expect(sideOf(link, dragEvent("dragover", { clientY: 135 }), "link")).toBe("after");
        });

        it("reads a group left and right, because groups are columns", () => {
            // Dragging a column upwards and expecting it to change places would be a strange
            // thing to expect.
            const group = document.createElement("div");
            boxOf(group, { left: 200, right: 400, width: 200 });

            expect(sideOf(group, dragEvent("dragover", { clientX: 220 }), "group"))
                .toBe("before");
            expect(sideOf(group, dragEvent("dragover", { clientX: 380 }), "group"))
                .toBe("after");
        });
    });

    describe("dropping", () => {

        it("tells the target which side it was dropped on, and what was carried", async () => {
            await profiles.updateSettings({ enableDragAndDrop: true });

            const source = document.createElement("div");
            source.id = "source";
            makeDraggable(source, { kind: "link", id: "source" });

            const target = document.createElement("div");
            target.id = "target";
            boxOf(target, { top: 0, bottom: 40, height: 40 });
            const drops: Array<[string, string]> = [];
            makeReorderTarget(target, "link", (side, id) => drops.push([side, id]));

            source.dispatchEvent(dragEvent("dragstart"));
            target.dispatchEvent(dragEvent("drop", { clientY: 35 }));

            expect(drops).toEqual([["after", "source"]]);
        });

        it("refuses a kind it does not take", async () => {
            // A group dropped on a link is not a reorder of anything.
            await profiles.updateSettings({ enableDragAndDrop: true });

            const source = document.createElement("div");
            source.id = "a-group";
            makeDraggable(source, { kind: "group", id: "a-group" });

            const target = document.createElement("div");
            target.id = "a-link";
            const drops: string[] = [];
            makeReorderTarget(target, "link", (_side, id) => drops.push(id));

            source.dispatchEvent(dragEvent("dragstart"));
            target.dispatchEvent(dragEvent("drop"));

            expect(drops).toEqual([]);
        });

        it("refuses a drop of something onto itself", async () => {
            await profiles.updateSettings({ enableDragAndDrop: true });

            const element = document.createElement("div");
            element.id = "same";
            makeDraggable(element, { kind: "link", id: "same" });
            const drops: string[] = [];
            makeReorderTarget(element, "link", (_side, id) => drops.push(id));

            element.dispatchEvent(dragEvent("dragstart"));
            element.dispatchEvent(dragEvent("drop"));

            expect(drops).toEqual([]);
        });

        it("refuses a drop while dragging is switched off", async () => {
            // Half a drag from before the setting was turned off, finishing after it.
            await profiles.updateSettings({ enableDragAndDrop: true });

            const source = document.createElement("div");
            source.id = "source";
            makeDraggable(source, { kind: "link", id: "source" });
            const target = document.createElement("div");
            target.id = "target";
            const drops: string[] = [];
            makeReorderTarget(target, "link", (_side, id) => drops.push(id));

            source.dispatchEvent(dragEvent("dragstart"));
            await profiles.updateSettings({ enableDragAndDrop: false });
            target.dispatchEvent(dragEvent("drop"));

            expect(drops).toEqual([]);
        });
    });

    /**
     *  A drop is allowed only where dragenter and dragover have both been cancelled, and the
     *  decorations inside a target - a heading, a description, a favicon - are what the
     *  pointer actually lands on while a drag is in flight.
     */
    describe("targets with things inside them", () => {

        it("stops what is inside it from dragging itself instead", () => {
            // An anchor drags a URL and an image drags a picture, both by default, and one
            // inside a draggable element takes the gesture over - so a link could only be
            // picked up by the strip its name and icon did not cover.
            const link = document.createElement("div");
            const anchor = document.createElement("a");
            const icon = document.createElement("img");
            link.append(anchor, icon);

            makeDraggable(link, { kind: "link", id: "a" });

            expect(link.draggable).toBe(true);
            expect(anchor.draggable).toBe(false);
            expect(icon.draggable).toBe(false);
        });

        it("cancels dragenter as well as dragover", async () => {
            await profiles.updateSettings({ enableDragAndDrop: true });

            const source = document.createElement("div");
            source.id = "source";
            makeDraggable(source, { kind: "link", id: "source" });
            const target = document.createElement("div");
            target.id = "target";
            makeContainerTarget(target, "link", () => undefined);

            source.dispatchEvent(dragEvent("dragstart"));

            // false means preventDefault was called, which is how a target says "yes".
            expect(target.dispatchEvent(dragEvent("dragenter"))).toBe(false);
            expect(target.dispatchEvent(dragEvent("dragover"))).toBe(false);
        });

        it("takes the pointer away from the decorations while a drag is in flight", async () => {
            // The stylesheet reads this off the root element. Without it, crossing onto a
            // heading fires dragleave on the head beneath and dragenter on something that is
            // not a target, and whether the drop works depends on where the cursor stopped.
            await profiles.updateSettings({ enableDragAndDrop: true });
            const source = document.createElement("div");
            makeDraggable(source, { kind: "link", id: "source" });

            source.dispatchEvent(dragEvent("dragstart"));
            expect(document.documentElement.classList.contains("dnd-active")).toBe(true);

            source.dispatchEvent(dragEvent("dragend"));
            expect(document.documentElement.classList.contains("dnd-active")).toBe(false);
        });

        it("names what is being carried, not only that something is", async () => {
            // The closed tabs panel holds its width while a row is dragged out of it, and
            // the stylesheet reads that off the root element. Keyed on "dnd-active" alone,
            // the rule fired for every drag and unfolded the panel whenever a link, a
            // subgroup or a group was picked up anywhere on the page - and it stayed unfolded
            // for the whole journey, because no mousemove is delivered while a drag is in
            // flight and the pointer rule is what would otherwise fold it again.
            await profiles.updateSettings({ enableDragAndDrop: true });

            const link = document.createElement("div");
            makeDraggable(link, { kind: "link", id: "a-link" });
            const row = document.createElement("div");
            makeDraggable(row, { kind: "closedTab", id: "a-tab", url: "https://x/", title: "X" });

            link.dispatchEvent(dragEvent("dragstart"));
            expect(document.documentElement.dataset.dndKind).toBe("link");
            link.dispatchEvent(dragEvent("dragend"));
            expect(document.documentElement.dataset.dndKind).toBeUndefined();

            row.dispatchEvent(dragEvent("dragstart"));
            expect(document.documentElement.dataset.dndKind).toBe("closedTab");
            row.dispatchEvent(dragEvent("dragend"));
            expect(document.documentElement.dataset.dndKind).toBeUndefined();
        });

        it("refuses dragenter for a kind it does not take", async () => {
            await profiles.updateSettings({ enableDragAndDrop: true });

            const source = document.createElement("div");
            source.id = "a-group";
            makeDraggable(source, { kind: "group", id: "a-group" });
            const target = document.createElement("div");
            target.id = "target";
            makeContainerTarget(target, "link", () => undefined);

            source.dispatchEvent(dragEvent("dragstart"));

            expect(target.dispatchEvent(dragEvent("dragenter"))).toBe(true);
        });
    });

    /**
     *  A closed tab is the one thing dragged here that is not already somewhere: dropping it
     *  makes a link. So it carries what a link is made of, and the target it lands on never
     *  has to reach into the panel it came from.
     */
    describe("carrying something that is not a link yet", () => {

        it("carries the address and the title, not only an identifier", async () => {
            await profiles.updateSettings({ enableDragAndDrop: true });
            const row = document.createElement("div");
            makeDraggable(row, {
                kind: "closedTab", id: "tab-1",
                url: "https://example.com/page", title: "A page"
            });

            row.dispatchEvent(dragEvent("dragstart"));

            expect(whatIsBeingDragged()).toEqual({
                kind: "closedTab", id: "tab-1",
                url: "https://example.com/page", title: "A page"
            });
        });

        it("is taken by a target that accepts closed tabs", async () => {
            await profiles.updateSettings({ enableDragAndDrop: true });
            const row = document.createElement("div");
            row.id = "tab-1";
            makeDraggable(row, {
                kind: "closedTab", id: "tab-1", url: "https://example.com/", title: "A page"
            });

            const target = document.createElement("div");
            target.id = "a-group";
            const took: string[] = [];
            makeContainerTarget(target, ["link", "closedTab"], id => took.push(id));

            row.dispatchEvent(dragEvent("dragstart"));
            target.dispatchEvent(dragEvent("drop"));

            expect(took).toEqual(["tab-1"]);
        });

        it("is refused by a target that only takes groups", async () => {
            await profiles.updateSettings({ enableDragAndDrop: true });
            const row = document.createElement("div");
            row.id = "tab-1";
            makeDraggable(row, {
                kind: "closedTab", id: "tab-1", url: "https://example.com/", title: "A page"
            });

            const target = document.createElement("div");
            target.id = "a-group";
            const took: string[] = [];
            makeReorderTarget(target, "group", (_side, id) => took.push(id));

            row.dispatchEvent(dragEvent("dragstart"));
            target.dispatchEvent(dragEvent("drop"));

            expect(took).toEqual([]);
        });
    });

    describe("containers inside containers", () => {

        it("gives a drop to the innermost container that takes it", async () => {
            // The bug: a subgroup sits inside a group and both take links, so a link dropped
            // on a subgroup's heading reached the group's handler afterwards - the outer one
            // ran last and won, and the link landed in the group rather than the subgroup.
            await profiles.updateSettings({ enableDragAndDrop: true });

            const group = document.createElement("div");
            const subgroup = document.createElement("div");
            group.appendChild(subgroup);
            document.body.appendChild(group);

            const took: string[] = [];
            makeContainerTarget(group, "link", () => took.push("group"));
            makeContainerTarget(subgroup, "link", () => took.push("subgroup"));

            const source = document.createElement("div");
            source.id = "a-link";
            makeDraggable(source, { kind: "link", id: "a-link" });
            source.dispatchEvent(dragEvent("dragstart"));

            subgroup.dispatchEvent(dragEvent("drop"));

            expect(took).toEqual(["subgroup"]);
        });

        it("still gives the group a drop aimed at the group", async () => {
            await profiles.updateSettings({ enableDragAndDrop: true });

            const group = document.createElement("div");
            const subgroup = document.createElement("div");
            group.appendChild(subgroup);
            document.body.appendChild(group);

            const took: string[] = [];
            makeContainerTarget(group, "link", () => took.push("group"));
            makeContainerTarget(subgroup, "link", () => took.push("subgroup"));

            const source = document.createElement("div");
            source.id = "a-link";
            makeDraggable(source, { kind: "link", id: "a-link" });
            source.dispatchEvent(dragEvent("dragstart"));

            group.dispatchEvent(dragEvent("drop"));

            expect(took).toEqual(["group"]);
        });
    });

    describe("what a target will take", () => {

        it("accepts any of the kinds it was given", async () => {
            await profiles.updateSettings({ enableDragAndDrop: true });

            const target = document.createElement("div");
            target.id = "a-link";
            boxOf(target, { top: 0, bottom: 40, height: 40 });
            const drops: string[] = [];
            makeReorderTarget(target, ["link", "subgroup"], (_side, id) => drops.push(id));

            const subgroup = document.createElement("div");
            subgroup.id = "a-subgroup";
            makeDraggable(subgroup, { kind: "subgroup", id: "a-subgroup" });
            subgroup.dispatchEvent(dragEvent("dragstart"));
            target.dispatchEvent(dragEvent("drop", { clientY: 10 }));

            expect(drops).toEqual(["a-subgroup"]);
        });

        it("reads a dragged subgroup up and down, like a link", () => {
            // It is drawn in the same stack as the links, not beside them.
            const element = document.createElement("div");
            boxOf(element, { top: 0, bottom: 40, height: 40 });

            expect(sideOf(element, dragEvent("dragover", { clientY: 5 }), "subgroup"))
                .toBe("before");
            expect(sideOf(element, dragEvent("dragover", { clientY: 35 }), "subgroup"))
                .toBe("after");
        });
    });

    /**
     *  **Where the carried thing is drawn, relative to the cursor.**
     *
     *  A link is as wide as its column and a closed tab's row is wider still, so grabbing one
     *  by its right end left the cursor outside the column the whole time it was being carried
     *  over it. The line that says where it will land is drawn on an element inside that
     *  column, and no element was under the cursor to draw it on: the drop landed where it
     *  looked like it would, with nothing at any point saying so.
     */
    describe("the picture under the cursor", () => {

        /** A row 400 wide and 24 tall, which is about a link in a column. */
        function wideRow(): HTMLElement {
            const row = document.createElement("div");
            boxOf(row, { left: 0, top: 100, right: 400, bottom: 124, width: 400, height: 24 });
            return row;
        }

        it("is redrawn from the cursor when something wide is grabbed by its far end",
            async () => {
                await profiles.updateSettings({ enableDragAndDrop: true });
                const row = wideRow();
                makeDraggable(row, { kind: "link", id: "a" });

                row.dispatchEvent(dragEvent("dragstart", { clientX: 380, clientY: 110 }));

                // 2em of the root font size, which jsdom keeps at 16px - near enough the left
                // edge that the cursor is inside the column wherever the row is drawn.
                expect(drawnAt).toEqual([{ image: row, x: 32, y: 10 }]);
            });

        it("keeps the height the thing was grabbed at, because that is what picks the side",
            async () => {
                await profiles.updateSettings({ enableDragAndDrop: true });
                const row = wideRow();
                makeDraggable(row, { kind: "closedTab", id: "a", url: "u", title: "t" });

                row.dispatchEvent(dragEvent("dragstart", { clientX: 300, clientY: 120 }));

                expect(drawnAt[0].y).toBe(20);
            });

        it("leaves it where it was drawn when it was grabbed near its leading edge already",
            async () => {
                await profiles.updateSettings({ enableDragAndDrop: true });
                const row = wideRow();
                makeDraggable(row, { kind: "link", id: "a" });

                row.dispatchEvent(dragEvent("dragstart", { clientX: 20, clientY: 110 }));

                expect(drawnAt).toEqual([]);
            });

        it("never moves a group, whose sideways position is the aim itself", async () => {
            // A group lands before or after its neighbours by where the cursor is across the
            // page. Sliding the column out from under the cursor would move the aim.
            await profiles.updateSettings({ enableDragAndDrop: true });
            const column = document.createElement("div");
            boxOf(column, { left: 0, top: 0, right: 400, bottom: 800, width: 400, height: 800 });
            makeDraggable(column, { kind: "group", id: "a" });

            column.dispatchEvent(dragEvent("dragstart", { clientX: 380, clientY: 400 }));

            expect(drawnAt).toEqual([]);
        });
    });
});
