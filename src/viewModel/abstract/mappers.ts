import {Environment, Group, Subgroup, Link} from "../../backend/entity/AppStateEntity";
import {GroupDTO, WorkspaceDTO, LinkDTO, SubgroupDTO} from "./dtos";

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
    collapsed: subgroup.collapsed
});