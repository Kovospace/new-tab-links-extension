import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { toggleManageLinksMode } from "../../../src/ui/partials/manageLinksMode";

const WORDING = { manage: "Manage links", finish: "Finish managing links" };

/**
 *  "Manage links" in a group's or a subgroup's menu. The subgroup had a copy of the group's
 *  code that never marked the menu entry active, so nothing in its menu said the mode was on.
 */
describe("toggleManageLinksMode", () => {

    let body: HTMLElement;
    let menuItem: HTMLElement;

    beforeEach(() => {
        vi.useFakeTimers();
        body = document.createElement("div");
        menuItem = document.createElement("options-menu-item");
        menuItem.textContent = WORDING.manage;
    });

    afterEach(() => vi.useRealTimers());

    it("turns the mode on: links managed, the menu entry active and offering to finish", () => {
        toggleManageLinksMode(body, menuItem, WORDING);
        vi.advanceTimersByTime(250);

        expect(body.classList.contains("managed")).toBe(true);
        expect(menuItem.classList.contains("active")).toBe(true);
        expect(menuItem.textContent).toBe(WORDING.finish);
    });

    it("turns it off again: nothing managed, the entry back to rest", () => {
        toggleManageLinksMode(body, menuItem, WORDING);
        toggleManageLinksMode(body, menuItem, WORDING);
        vi.advanceTimersByTime(250);

        expect(body.classList.contains("managed")).toBe(false);
        expect(menuItem.classList.contains("active")).toBe(false);
        expect(menuItem.textContent).toBe(WORDING.manage);
    });

    it("follows the mode rather than flipping the entry, so the two cannot drift apart", () => {
        body.classList.add("managed");            // already on, the entry not yet marked

        toggleManageLinksMode(body, menuItem, WORDING);

        expect(body.classList.contains("managed")).toBe(false);
        expect(menuItem.classList.contains("active")).toBe(false);
    });
});
