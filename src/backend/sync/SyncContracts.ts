/**
 *  The wire contract shared with the backend.
 *
 *  Every type here mirrors a record in the backend's sync module and must not drift from it.
 *  The backend is the authority: see its `sync/dtos` package, and `SyncSnapshotDto` in
 *  particular. Only the fields this extension actually reads or sends are mirrored.
 */

/** What kind of record an operation is about. */
export type SyncEntityKind = "profile" | "environment" | "group" | "subgroup" | "link";

/** What an operation does to the record it names. */
export type SyncOperationKind = "upsert" | "delete";

/**
 *  One change to push.
 *
 *  It is one flat shape for all five kinds of record rather than a union, because that is
 *  how the backend accepts it: fields that do not apply to the kind are simply absent.
 */
export interface SyncOperation {
    op: SyncOperationKind;
    type: SyncEntityKind;
    id: string;

    /** Parent profile, for an environment. */
    profileId?: string;
    /** Parent environment, for a group. */
    environmentId?: string;
    /** Parent group, for a subgroup or a link. */
    parentGroupId?: string;
    /** Parent subgroup, for a link nested in one; null means directly in the group. */
    parentSubgroupId?: string | null;

    /** Display name, for a profile, environment, group or subgroup. */
    name?: string;
    /** Free text, for an environment, group or subgroup. */
    description?: string | null;
    /** Display text, for a link. */
    title?: string;
    /** Address, for a link. */
    url?: string;
    /** Cached favicon address, for a link. */
    faviconUrl?: string | null;

    /** Whether a subgroup is folded away right now. */
    collapsed?: boolean;
    /** Whether a subgroup starts folded away. */
    defaultCollapsed?: boolean;

    /** Zero based position among the record's siblings. */
    position?: number;
}

/** A batch of changes one device made, in the order it made them. */
export interface SyncPushRequest {
    originDeviceId: string;
    operations: SyncOperation[];
}

/** An identifier the server could not keep, and what it stored instead. */
export interface SyncIdentifierRemap {
    type: SyncEntityKind;
    clientId: string;
    serverId: string;
}

/** An operation the server did not apply, and why. */
export interface SyncRejectedOperation {
    index: number;
    type: SyncEntityKind;
    id: string;
    reason: string;
}

/** What became of a pushed batch. */
export interface SyncPushResult {
    appliedAt: string;
    remaps: SyncIdentifierRemap[];
    rejected: SyncRejectedOperation[];
}

// ------------------------------------------------------------------ the snapshot

export interface SnapshotProfileDto {
    id: string;
    ownerId: string;
    name: string;
    position: number;
    createdAt: string;
    updatedAt: string;
}

export interface SnapshotEnvironmentDto {
    id: string;
    ownerId: string;
    profileId: string;
    name: string;
    description: string | null;
    position: number;
    createdAt: string;
    updatedAt: string;
}

export interface SnapshotGroupDto {
    id: string;
    environmentId: string;
    name: string;
    description: string | null;
    position: number;
    createdAt: string;
    updatedAt: string;
}

export interface SnapshotSubgroupDto {
    id: string;
    parentGroupId: string;
    name: string;
    description: string | null;
    position: number;
    collapsed: boolean;
    defaultCollapsed: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface SnapshotLinkDto {
    id: string;
    parentGroupId: string;
    parentSubgroupId: string | null;
    title: string;
    url: string;
    faviconUrl: string | null;
    position: number;
    createdAt: string;
    updatedAt: string;
}

/**
 *  Everything one account owns, as flat collections keyed by identifier.
 *
 *  Flat rather than nested on purpose: this extension stores its state as flat maps, so a
 *  flat snapshot maps onto it without taking a tree apart.
 */
export interface SyncSnapshot {
    owner: { id: string; username: string };
    profiles: SnapshotProfileDto[];
    environments: SnapshotEnvironmentDto[];
    groups: SnapshotGroupDto[];
    subgroups: SnapshotSubgroupDto[];
    links: SnapshotLinkDto[];
    capturedAt: string;
}
