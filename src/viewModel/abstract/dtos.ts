export interface WorkpsaceDTO {
    id: string;
    title: string;
    description?: string;
    active?: boolean;
}

export interface GroupDTO {
    id: string;
    title: string;
    description?: string;
    items?: GroupItemDTO[];
}

export interface GroupItemDTO {
    title: string;
    type: string;
    id: string;
    position: number;
    description: string;
    //
    workspaceId: string;
    groupId: string;
}

export interface LinkDTO extends GroupItemDTO {
    url: string;
    subGroupId: string;
}

export interface SubgroupDTO extends GroupItemDTO {
    links: LinkDTO[];
}