import { beforeEach, describe, expect, it, vi } from "vitest";

import { applyGroupSize, attachResizeHandle } from "../../../src/ui/partials/groupResize";
import { CLASS_GROUP_RESIZED, CLASS_GROUP_RESIZING } from "../../../src/constants";
import { MIN_GROUP_HEIGHT, MIN_GROUP_WIDTH } from "../../../src/backend/repository/GroupSizeRepository";

/** #173: the bottom-right corner of a group resizes it, in em, and a double-click resets it. */
describe("the group's resize corner", () => {

    let group: HTMLElement;
    let handle: HTMLElement;
    let resized: ReturnType<typeof vi.fn>;
    let reset: ReturnType<typeof vi.fn>;

    const pointer = (type: string, x: number, y: number) =>
        handle.dispatchEvent(new MouseEvent(type, { button: 0, clientX: x, clientY: y, bubbles: true }));

    beforeEach(() => {
        group = document.createElement("div");
        group.style.fontSize = "10px";
        group.draggable = true;
        group.getBoundingClientRect = () => ({ width: 150, height: 200 } as DOMRect);
        document.body.replaceChildren(group);
        resized = vi.fn();
        reset = vi.fn();
        handle = attachResizeHandle(group, { resized, reset });
    });

    it("follows the pointer in em and keeps the size when let go", () => {
        pointer("pointerdown", 100, 100);
        pointer("pointermove", 150, 130);

        expect(group.style.width).toBe("20em");
        expect(group.style.height).toBe("23em");
        expect(group.classList.contains(CLASS_GROUP_RESIZED)).toBe(true);
        expect(resized).not.toHaveBeenCalled();

        pointer("pointerup", 150, 130);
        expect(resized).toHaveBeenCalledWith({ width: 20, height: 23 });
    });

    it("stops the group being draggable while the corner is held, so the column is not carried off", () => {
        pointer("pointerdown", 100, 100);
        expect(group.draggable).toBe(false);
        expect(group.classList.contains(CLASS_GROUP_RESIZING)).toBe(true);

        pointer("pointerup", 100, 100);
        expect(group.draggable).toBe(true);
        expect(group.classList.contains(CLASS_GROUP_RESIZING)).toBe(false);
    });

    it("never goes below the minimum", () => {
        pointer("pointerdown", 100, 100);
        pointer("pointermove", -500, -500);
        pointer("pointerup", -500, -500);

        expect(resized).toHaveBeenCalledWith({ width: MIN_GROUP_WIDTH, height: MIN_GROUP_HEIGHT });
    });

    it("stores nothing for a press that never moved - half of a double-click", () => {
        pointer("pointerdown", 100, 100);
        pointer("pointerup", 100, 100);
        expect(resized).not.toHaveBeenCalled();
    });

    it("resets on a double-click", () => {
        handle.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
        expect(reset).toHaveBeenCalled();
    });

    it("draws the automatic size again when the size is forgotten", () => {
        applyGroupSize(group, { width: 20, height: 30 });
        applyGroupSize(group, null);

        expect(group.style.width).toBe("");
        expect(group.style.height).toBe("");
        expect(group.classList.contains(CLASS_GROUP_RESIZED)).toBe(false);
    });
});
