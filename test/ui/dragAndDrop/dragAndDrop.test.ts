import { beforeEach, describe, expect, it } from "vitest";

import { ProfileRepository } from "../../../src/backend/repository/ProfileRepository";
import {
    isDragAndDropEnabled, makeDraggable, makeReorderTarget, sideOf, useProfilesForDragAndDrop,
    whatIsBeingDragged
} from "../../../src/ui/dragAndDrop/dragAndDrop";

/** jsdom lays nothing out, so an element is told where it is. */
function boxOf(element: HTMLElement, box: Partial<DOMRect>): void {
    element.getBoundingClientRect = () => ({
        left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100, x: 0, y: 0,
        toJSON: () => ({}), ...box
    }) as DOMRect;
}

/** A drag event jsdom will carry, with the dataTransfer a browser would provide. */
function dragEvent(type: string, at: { clientX?: number; clientY?: number } = {}): DragEvent {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, ...at }) as DragEvent;
    const data = new Map<string, string>();
    Object.defineProperty(event, "dataTransfer", {
        value: {
            setData: (format: string, value: string) => data.set(format, value),
            getData: (format: string) => data.get(format) ?? "",
            effectAllowed: "", dropEffect: ""
        }
    });
    return event;
}

describe("dragAndDrop", () => {

    let profiles: ProfileRepository;

    beforeEach(async () => {
        document.body.innerHTML = "";
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

        it("refuses to start a drag while dragging is switched off", () => {
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
});
