
// predicates

import {GroupItem, Link, Subgroup} from "../backend/entity/AppStateEntity";

export const isItemInGroupAndEnv =
    (environmentId: string, groupId: string) =>
        (groupItem: Link | Subgroup): boolean =>
            groupItem.environmentId === environmentId &&
            groupItem.groupId === groupId;

export const isRootGroupLink =
    () =>
        (link: Link): boolean =>
            link.subGroupId === undefined || link.subGroupId === null || link.subGroupId === ""

export const isSubGroup: () => (subGroup: GroupItem) => boolean =
    (): (subGroup: GroupItem) => boolean =>
        (subgroup: GroupItem): boolean => !("url" in subgroup) && !("subGroupId" in subgroup)

export const isSubGroupLink =
    () =>
        (link: Link): boolean =>
            link.subGroupId !== undefined && link.subGroupId !== null && link.subGroupId !== ""

