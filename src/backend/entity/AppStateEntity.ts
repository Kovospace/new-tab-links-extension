import { ProfileSettings } from "./ProfileSettings";
import { TabGroupColor } from "./TabGroupColors";

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

    /**
     * What this profile is set to do. Absent for a profile stored before settings existed,
     * and for one that has never been configured; read it through `settingsOf()`.
     */
    settings?: ProfileSettings;
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

    /**
     * Whether a tab that lands on one of this subgroup's links should be pulled into the
     * subgroup's Chrome tab group, wherever in the browser it was opened from.
     *
     * Absent means off, which is what every subgroup stored before this existed says.
     */
    catchLinksIntoTabGroup?: boolean;

    /**
     * The colour Chrome paints this subgroup's tab group, and the colour the new tab page
     * tints its heading. One of nine names - see `TabGroupColors.ts`.
     *
     * Absent means it has never been given one, which is what every subgroup stored before
     * this existed says; it is assigned one the next time it is drawn.
     */
    color?: TabGroupColor;
}

export interface Link extends GroupItem {
    url: string;
    subGroupId?: string;
}