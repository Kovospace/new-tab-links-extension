export interface AppState {
    environments: Record<string, Environment>;
    groups: Record<string, Group>;
    subgroups: Record<string, Subgroup>;
    links: Record<string, Link>;
    activeEnvironmentId: string | null | undefined;
}

export interface Environment {
    id: string;
    name: string;
    description?: string;
    createdAt: number;
    order?: number;
}

export interface Group {
    id: string;
    title: string;
    description?: string;
    environmentId: string;
    createdAt: number;
    order?: number;
}

export interface GroupItem {
    id: string;
    title: string;
    environmentId: string;
    groupId: string;
    type: string;
    position: number;
    createdAt: number;
}

export interface Subgroup extends GroupItem {
    collapsed: boolean;
    defaultCollapsed: boolean;
    description?: string;
}

export interface Link extends GroupItem {
    url: string;
    subGroupId?: string;
}