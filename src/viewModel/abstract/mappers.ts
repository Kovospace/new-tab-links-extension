import {Environment, Group} from "../../backend/entity/AppStateEntity";
import {GroupDTO, WorkpsaceDTO} from "./dtos";

export const toWorkspaceDTO = (workspace: Environment): WorkpsaceDTO => ({
    id: workspace.id,
    title: workspace.name
});

export const toGroupDTO = (group: Group): GroupDTO => ({
    id: group.id,
    title: group.title,
    description: group.description
});