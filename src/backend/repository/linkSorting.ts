import { GroupItem } from "../entity/AppStateEntity";

/** The four orders a group's links can be put in, once, from the group's menu (#184). */
export type LinkSortOrder = "newest" | "oldest" | "nameAsc" | "nameDesc";

/** Names compared as a reader would: case and accents aside, "link 2" before "link 10". */
const NAMES = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

/** A link's name for sorting: its title, or its address when it has none. */
function nameOf(item: GroupItem & { url?: string }): string {
    return item.title?.trim() || item.url || "";
}

function compare(order: LinkSortOrder, one: GroupItem, other: GroupItem): number {
    switch (order) {
        case "oldest": return one.createdAt - other.createdAt;
        case "newest": return other.createdAt - one.createdAt;
        case "nameAsc": return NAMES.compare(nameOf(one), nameOf(other));
        case "nameDesc": return NAMES.compare(nameOf(other), nameOf(one));
    }
}

/**
 *  A sequence with its links put in order and everything else left where it stands.
 *
 *  **Subgroups keep their slots.** A group's own links share one sequence with its subgroups, so
 *  sorting the links means filling the places links held with the sorted links, and leaving each
 *  subgroup at its index - a sort is about links, and the subgroups are where the user put them.
 *
 *  Stable: two links that compare equal keep the order they were in.
 *
 *  @param sequence the scope as it is drawn, subgroups included
 *  @param isLink   which items of it are links
 */
export function sortedIntoLinkSlots<ITEM extends GroupItem>(
    sequence: readonly ITEM[], isLink: (item: ITEM) => boolean, order: LinkSortOrder
): ITEM[] {
    const sorted = sequence.filter(isLink).sort((one, other) => compare(order, one, other));
    let next = 0;
    return sequence.map(item => isLink(item) ? sorted[next++] : item);
}
