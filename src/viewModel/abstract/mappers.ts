import {Environment, Group, Subgroup, Link} from "../../backend/entity/AppStateEntity";
import {GroupDTO, WorkspaceDTO, LinkDTO, SubgroupDTO} from "./dtos";
import { DEFAULT_TAB_GROUP_COLOR } from "../../backend/entity/TabGroupColors";

export const toWorkspaceDTO = (workspace: Environment): WorkspaceDTO => ({
    id: workspace.id,
    title: workspace.name
});

export const toGroupDTO = (group: Group): GroupDTO => ({
    id: group.id,
    title: group.title,
    description: group.description,
    order: group.order ?? 0
});

export const toLinkDTO = (link: Link | undefined): LinkDTO | null => {
    if (!link) {
        return null;
    }
    return {
        id: link.id,
        title: link.title,
        url: link.url,
        position: link.position,
        type: "link",
        workspaceId: link.environmentId,
        groupId: link.groupId,
        subGroupId: link.subGroupId
    } satisfies LinkDTO
}

export const toSubGroupDTO = (subgroup: Subgroup): SubgroupDTO => ({
    id: subgroup.id,
    title: subgroup.title,
    description: subgroup.description,
    links: [],
    position: subgroup.position,
    type: "subgroup",
    groupId: subgroup.groupId,
    workspaceId: subgroup.environmentId,
    collapsed: subgroup.collapsed,
    catchLinksIntoTabGroup: subgroup.catchLinksIntoTabGroup ?? false,
    // A subgroup stored before colours existed has none. The DTO always has one, because
    // every place that reads it - the heading, the swatch, the tab group - needs a colour
    // rather than a decision; the stored record is given one when it is next changed.
    color: subgroup.color ?? DEFAULT_TAB_GROUP_COLOR
});