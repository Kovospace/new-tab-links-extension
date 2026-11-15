import { describe, expect, it } from "vitest";

import { sortedIntoLinkSlots } from "../../../src/backend/repository/linkSorting";
import { GroupItem } from "../../../src/backend/entity/AppStateEntity";

/** #184: the four orders, and the subgroups left where they stand. */
describe("sortedIntoLinkSlots", () => {

    const item = (id: string, title: string, createdAt: number, type = "link", url = ""): GroupItem & { url: string } =>
        ({ id, title, createdAt, type, url, environmentId: "e", groupId: "g", position: 0 });

    const isLink = (one: GroupItem) => one.type === "link";
    const ids = (items: GroupItem[]) => items.map(one => one.id);

    const sequence = [
        item("banana", "banana", 2),
        item("sub", "Sub", 0, "subgroup"),
        item("Apple", "Apple", 3),
        item("cherry", "Čerešňa", 1)
    ];

    it("sorts by when a link was added, either way", () => {
        expect(ids(sortedIntoLinkSlots(sequence, isLink, "oldest"))).toEqual(["cherry", "sub", "banana", "Apple"]);
        expect(ids(sortedIntoLinkSlots(sequence, isLink, "newest"))).toEqual(["Apple", "sub", "banana", "cherry"]);
    });

    it("sorts by name as a reader would - case and accents aside, either way", () => {
        expect(ids(sortedIntoLinkSlots(sequence, isLink, "nameAsc"))).toEqual(["Apple", "sub", "banana", "cherry"]);
        expect(ids(sortedIntoLinkSlots(sequence, isLink, "nameDesc"))).toEqual(["cherry", "sub", "banana", "Apple"]);
    });

    it("puts 'link 2' before 'link 10'", () => {
        const numbered = [item("ten", "link 10", 0), item("two", "link 2", 0)];
        expect(ids(sortedIntoLinkSlots(numbered, isLink, "nameAsc"))).toEqual(["two", "ten"]);
    });

    it("names an untitled link by its address", () => {
        const untitled = [item("zed", "Zed", 0), item("bare", "", 0, "link", "https://alpha.test")];
        expect(ids(sortedIntoLinkSlots(untitled, isLink, "nameAsc"))).toEqual(["bare", "zed"]);
    });

    it("keeps links that compare equal in the order they were in", () => {
        const same = [item("first", "Same", 5), item("second", "same", 5)];
        expect(ids(sortedIntoLinkSlots(same, isLink, "nameDesc"))).toEqual(["first", "second"]);
        expect(ids(sortedIntoLinkSlots(same, isLink, "newest"))).toEqual(["first", "second"]);
    });
});
