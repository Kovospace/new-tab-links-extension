export interface User {
    id: string;
    username: string;
}

/**
 * The data content of a single profile: workspaces, groups, subgroups, links
 * and which workspace is currently active.
 */
export interface ProfileData {
    environments: Record<string, Environment>;
    groups: Record<string, Group>;
    subgroups: Record<string, Subgroup>;
    links: Record<string, Link>;
    activeEnvironmentId: string | null | undefined;
}

/**
 * Lightweight profile descriptor stored in the profile registry.
 * Does not contain the full profile data — that is stored separately per profile.
 */
export interface ProfileMeta {
    id: string;
    name: string;
    createdAt: number;
}

/**
 * A named profile stored in IndexedDB. Contains all profile data plus metadata.
 */
export interface Profile extends ProfileData {
    id: string;
    name: string;
    createdAt: number;
}

/**
 * Full runtime application state: active user, which profile is loaded,
 * plus the profile data itself (flat, for backwards compatibility).
 */
export interface AppState extends ProfileData {
    user: User;
    activeProfileId: string;
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