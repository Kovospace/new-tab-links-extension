
// predicates

export const isItemInGroupAndEnv =
    (environmentId: string, groupId: string) =>
        (groupItem: Link | Subgroup): boolean =>
            groupItem.environmentId === environmentId &&
            groupItem.groupId === groupId;

export const isRootGroupLink =
    () =>
        (link: Link): boolean =>
            link.subGroupId === undefined || link.subGroupId === null || link.subGroupId === ""

export const isSubGroup =
    () =>
        (subgroup: Subgroup): boolean =>
            subgroup.url === undefined && subgroup.subGroupId === undefined

export const isSubGroupLink =
    () =>
        (link: Link): boolean =>
            link.subGroupId !== undefined && link.subGroupId !== null && link.subGroupId !== ""

// mappers

export const toLinkDTO = (link: Link): LinkDTO => ({
    id: link.id,
    title: link.title,
    url: link.url,
    position: link.position,
    type: "link",
});

export const toSubGroupDTO = (subgroup: Subgroup): SubgroupDTO => ({
    id: subgroup.id,
    title: subgroup.title,
    links: [],
    position: subgroup.position,
    type: "subgroup"
});

