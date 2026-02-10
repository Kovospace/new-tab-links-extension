export interface AppState {
    environments: Record<string, Environment>;
    groups: Record<string, Group>;
    subgroups: Record<string, Subgroup>;
    links: Record<string, Link>;
    activeEnvironmentId: string;
}

export interface Environment {
    id: string;
    name: string;
    createdAt: number;
    order: number;
}

export interface Group {
    id: string;
    title: string;
    environmentId: string;
}

export interface GroupItem {
    id: string;
    title: string;
    environmentId: string;
    groupId: string;
    type: string;
    position: number;
}

export interface Subgroup extends GroupItem {
    collapsed: boolean;
    defaultCollapsed: boolean;
}

export interface Link extends GroupItem {
    url: string;
    subGroupId: string;
}