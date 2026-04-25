
export interface ViewModelDTO {
    id: string;
}

export interface WorkspaceDTO extends ViewModelDTO {
    title: string;
    description?: string;
    active?: boolean;
}

export interface GroupDTO extends ViewModelDTO {
    title: string;
    description?: string;
    items?: GroupItemDTO[];
}

export interface GroupItemDTO extends ViewModelDTO {
    title: string;
    type: string;
    position: number;
    description?: string;
    //
    workspaceId: string;
    groupId: string;
}

export interface LinkDTO extends GroupItemDTO {
    url: string;
    subGroupId?: string;
}

export interface SubgroupDTO extends GroupItemDTO {
    links?: LinkDTO[] | null;
}

export interface ProfileDTO extends ViewModelDTO {
    name: string;
    /** Whether this profile is the currently loaded one. */
    active: boolean;
}