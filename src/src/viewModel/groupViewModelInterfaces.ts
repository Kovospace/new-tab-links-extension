
export interface GroupItemDTO {
    title: string;
    type: string;
    id: string;
    position: number;
}

export interface LinkDTO extends GroupItemDTO{
    url: string;
}

export interface SubgroupDTO extends GroupItemDTO {
    links: LinkDTO[];
}

export type GroupItemsDTO = GroupItemDTO[];

export interface GroupDTO {
    groupItems:  GroupItemDTO[];
    groupId: string;
    title: string;
    description: string;
}
