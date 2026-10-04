import { describe, expect, it } from "vitest";

import {
    bookmarkMenuTree,
    bookmarkMenuWorkspaceName,
    targetMenuItemId,
    targetOfMenuItem
} from "../../../../src/backend/worker/module/bookmarkMenuTree";
import { AppState } from "../../../../src/backend/entity/AppStateEntity";
import { environment, group, profileOf, subgroup } from "../../../support/profileDataFixtures";

function state(activeEnvironmentId: string | null): AppState {
    return {
        user: { id: "u", username: "u" },
        activeProfileId: "p",
        ...profileOf({
            environments: [environment("env-work", "Work"), environment("env-home", "Home")],
            groups: [
                group("grp-second", "Second", "env-work", 1),
                group("grp-first", "First", "env-work", 0),
                group("grp-home", "Home group", "env-home", 0)
            ],
            subgroups: [
                subgroup("sub-later", "Later", "grp-first", "env-work", 3),
                subgroup("sub-sooner", "Sooner", "grp-first", "env-work", 1)
            ],
            activeEnvironmentId
        })
    };
}

/**
 *  What the right-click submenu offers. It is drawn ahead of time and must offer the groups
 *  the open workspace shows, in the order it shows them - offering another workspace's group
 *  would file a link somewhere the user is not looking.
 */
describe("bookmarkMenuTree", () => {

    it("offers the open workspace's groups in their drawn order, each with its subgroups", () => {
        expect(bookmarkMenuTree(state("env-work"))).toEqual([
            {
                id: "grp-first", title: "First", subgroups: [
                    { id: "sub-sooner", title: "Sooner" },
                    { id: "sub-later", title: "Later" }
                ]
            },
            { id: "grp-second", title: "Second", subgroups: [] }
        ]);
    });

    it("follows the workspace open on this device", () => {
        expect(bookmarkMenuTree(state("env-home")).map(entry => entry.id)).toEqual(["grp-home"]);
    });

    it("falls back to the first workspace when the stored one is gone", () => {
        expect(bookmarkMenuTree(state("env-deleted")).map(entry => entry.id))
            .toEqual(["grp-first", "grp-second"]);
    });

    it("offers nothing without a profile, which leaves the entry that opens the popup", () => {
        expect(bookmarkMenuTree(null)).toEqual([]);
    });
});

/** The disabled heading of the submenu, naming the workspace its groups come from. */
describe("bookmarkMenuWorkspaceName", () => {

    it("names the workspace whose groups are offered", () => {
        expect(bookmarkMenuWorkspaceName(state("env-home"))).toBe("Home");
        expect(bookmarkMenuWorkspaceName(state("env-deleted"))).toBe("Work");
    });

    it("names nothing without a profile", () => {
        expect(bookmarkMenuWorkspaceName(null)).toBeNull();
    });
});

describe("menu item identifiers", () => {

    it("carry a group and a subgroup through a click", () => {
        const id = targetMenuItemId("bookmark-page", { groupId: "g", subgroupId: "s" });
        expect(targetOfMenuItem("bookmark-page", id)).toEqual({ groupId: "g", subgroupId: "s" });
    });

    it("carry a group's root level as a group alone", () => {
        const id = targetMenuItemId("bookmark-link", { groupId: "g" });
        expect(targetOfMenuItem("bookmark-link", id)).toEqual({ groupId: "g" });
    });

    it("are not read as targets when they belong to the other menu or are not targets", () => {
        const id = targetMenuItemId("bookmark-link", { groupId: "g" });
        expect(targetOfMenuItem("bookmark-page", id)).toBeNull();
        expect(targetOfMenuItem("bookmark-page", "bookmark-page")).toBeNull();
        expect(targetOfMenuItem("bookmark-page", "bookmark-page|choose")).toBeNull();
        expect(targetOfMenuItem("bookmark-page", "bookmark-page|g||menu")).toBeNull();
    });
});
