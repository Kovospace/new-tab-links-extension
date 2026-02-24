import {Environment, Group, Subgroup, Link} from "../../backend/entity/AppStateEntity";
import {GroupDTO, WorkpsaceDTO, LinkDTO} from "./dtos";

export const toWorkspaceDTO = (workspace: Environment): WorkpsaceDTO => ({
    id: workspace.id,
    title: workspace.name
});

export const toGroupDTO = (group: Group): GroupDTO => ({
    id: group.id,
    title: group.title,
    description: group.description
});

export const toLinkDTO = (link: Link): LinkDTO => ({
    id: link.id,
    title: link.title,
    url: link.url,
    position: link.position,
    type: "link",
    workspaceId: link.environmentId,
    groupId: link.groupId,
    subGroupId: link.subGroupId
});

export const toSubGroupDTO = (subgroup: Subgroup): SubgroupDTO => ({
    id: subgroup.id,
    title: subgroup.title,
    links: [],
    position: subgroup.position,
    type: "subgroup"
});