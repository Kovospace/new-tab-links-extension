import { Environment, Group, Link, ProfileData, Subgroup } from "../entity/AppStateEntity";

/**
 *  The outcome of merging one profile's local data with the copy held by the account.
 */
export interface ProfileMergeResult {

    /** The merged profile, ready to be stored locally and pushed to the backend. */
    merged: ProfileData;

    /**
     *  Local identifier -> the identifier that survived the merge, for every local entity
     *  that turned out to already exist in the account.
     *
     *  The remote identifier always wins, so that every device ends up naming the same
     *  thing the same way. Anything queued locally against the old identifier has to be
     *  rewritten through this map before it is pushed.
     */
    adoptedIds: Record<string, string>;
}

/**
 *  Merges what a device already holds into what the account already holds.
 *
 *  This runs exactly once per profile, when an extension that already has links is signed
 *  in to an account that already has links. Afterwards the two are one dataset and ordinary
 *  push/pull keeps them that way, so nothing here is on a hot path.
 *
 *  **Identity is the identifier; the name is only a fallback.** Where both sides hold a
 *  record under the same uuid it is one record that the two ends describe differently, and
 *  the account's description wins. Only a local record the account has never heard of is
 *  matched by name, which is the one thing two devices that have never met can agree on:
 *  they both call their first profile "Default" and mean the same thing by it.
 *
 *  Pairing by name alone was a data-loss bug, and an easy one to reintroduce. A device that
 *  synchronised this account once and then signed out keeps the account's identifiers, since
 *  signing out clears the baseline and deliberately keeps the data. Everything renamed or
 *  moved elsewhere in the meantime then failed to pair by name, took the "carry it over
 *  keeping its identifier" branch, and wrote the device's stale copy over the account's
 *  record in the merged map - under the account's own uuid. The push that ends the merge sent
 *  that as an upsert, the other device pulled it, and the user's rename was gone. Deletions
 *  are withheld at first contact; an upsert of a record that already exists is not.
 *
 *  The rest of the rules come from TODOS.md: containers pair up by name, and a link that
 *  already exists is not added twice - but two links that merely share a URL under different
 *  names are two different links and both are kept.
 *
 *  **The remote side is the base.** Local entities that pair up adopt the remote identifier;
 *  local entities with no counterpart are carried over keeping the identifier they have, and
 *  are appended after whatever the account already had, so nothing is reordered under the
 *  user on the device that happened to sync second.
 *
 *  A record edited on a device while it was signed out loses that edit to the account's copy.
 *  That is not decidable without knowing which is newer, and no entity here carries a
 *  modification time - only `createdAt`. Losing the edit of the device that was disconnected
 *  is the lesser harm, and the consistent one: it is what a pull does everywhere else.
 */
export class ProfileMergeEngine {

    /**
     *  Merges a local profile into the account's copy of the same profile.
     *
     *  @param local   what this device holds
     *  @param remote  what the account holds, mapped out of the backend snapshot
     *  @return        the merged profile and the identifiers the local side gave up
     */
    public static merge(local: ProfileData, remote: ProfileData): ProfileMergeResult {

        const adoptedIds: Record<string, string> = {};

        const environments = this.mergeEnvironments(local, remote, adoptedIds);
        const groups = this.mergeGroups(local, remote, adoptedIds);
        const subgroups = this.mergeSubgroups(local, remote, adoptedIds);
        const links = this.mergeLinks(local, remote, adoptedIds);

        return {
            merged: {
                environments,
                groups,
                subgroups,
                links,
                // Which workspace is open is this device's business and is never synchronised;
                // it only has to survive an identifier it may just have given up.
                activeEnvironmentId: this.resolveActiveEnvironment(local, environments, adoptedIds)
            },
            adoptedIds
        };
    }

    // ---------------------------------------------------------------- containers

    /** Pairs workspaces by name across the whole profile. */
    private static mergeEnvironments(
        local: ProfileData,
        remote: ProfileData,
        adoptedIds: Record<string, string>
    ): Record<string, Environment> {

        const merged: Record<string, Environment> = { ...remote.environments };
        const claimed = this.claimedByIdentity(local.environments, remote.environments);
        const remoteByName = this.indexBy(
            this.unclaimed(this.inDisplayOrder(Object.values(remote.environments)), claimed),
            environment => this.asName(environment.name));

        let nextOrder = this.highestOrder(Object.values(remote.environments));

        for (const environment of this.inDisplayOrder(Object.values(local.environments))) {
            if (claimed.has(environment.id)) {
                continue;   // the account holds this very record; its copy is already in merged
            }
            const counterpart = remoteByName.get(this.asName(environment.name));

            if (counterpart && !claimed.has(counterpart.id)) {
                adoptedIds[environment.id] = counterpart.id;
                claimed.add(counterpart.id);
                continue;
            }
            merged[environment.id] = { ...environment, order: ++nextOrder };
        }
        return merged;
    }

    /** Pairs groups by title, within the workspace they belong to. */
    private static mergeGroups(
        local: ProfileData,
        remote: ProfileData,
        adoptedIds: Record<string, string>
    ): Record<string, Group> {

        const merged: Record<string, Group> = { ...remote.groups };
        const claimed = this.claimedByIdentity(local.groups, remote.groups);
        const remoteByScope = this.indexBy(
            this.unclaimed(this.inDisplayOrder(Object.values(remote.groups)), claimed),
            group => this.scoped(group.environmentId, this.asName(group.title)));

        const nextOrder = this.highestOrderPerScope(
            Object.values(remote.groups), group => group.environmentId);

        for (const group of this.inDisplayOrder(Object.values(local.groups))) {
            if (claimed.has(group.id)) {
                continue;   // the account holds this very record; its copy is already in merged
            }
            const environmentId = this.resolve(group.environmentId, adoptedIds);
            const counterpart = remoteByScope.get(
                this.scoped(environmentId, this.asName(group.title)));

            if (counterpart && !claimed.has(counterpart.id)) {
                adoptedIds[group.id] = counterpart.id;
                claimed.add(counterpart.id);
                continue;
            }
            merged[group.id] = {
                ...group,
                environmentId,
                order: this.nextIn(nextOrder, environmentId)
            };
        }
        return merged;
    }

    /** Pairs subgroups by title, within the group they belong to. */
    private static mergeSubgroups(
        local: ProfileData,
        remote: ProfileData,
        adoptedIds: Record<string, string>
    ): Record<string, Subgroup> {

        const merged: Record<string, Subgroup> = { ...remote.subgroups };
        const claimed = this.claimedByIdentity(local.subgroups, remote.subgroups);
        const remoteByScope = this.indexBy(
            this.unclaimed(this.inPositionOrder(Object.values(remote.subgroups)), claimed),
            subgroup => this.scoped(subgroup.groupId, this.asName(subgroup.title)));

        const nextPosition = this.highestPositionPerScope(
            Object.values(remote.subgroups), subgroup => subgroup.groupId);

        for (const subgroup of this.inPositionOrder(Object.values(local.subgroups))) {
            if (claimed.has(subgroup.id)) {
                continue;   // the account holds this very record; its copy is already in merged
            }
            const groupId = this.resolve(subgroup.groupId, adoptedIds);
            const counterpart = remoteByScope.get(
                this.scoped(groupId, this.asName(subgroup.title)));

            if (counterpart && !claimed.has(counterpart.id)) {
                adoptedIds[subgroup.id] = counterpart.id;
                claimed.add(counterpart.id);
                continue;
            }
            merged[subgroup.id] = {
                ...subgroup,
                groupId,
                environmentId: this.resolve(subgroup.environmentId, adoptedIds),
                position: this.nextIn(nextPosition, groupId)
            };
        }
        return merged;
    }

    // -------------------------------------------------------------------- links

    /**
     *  Keeps one copy of a link the account already has, and both copies of two links that
     *  merely share a URL.
     *
     *  A link is "the same link" only when its title *and* its address match, inside the
     *  same group or subgroup. That is the rule from TODOS.md, and it errs the safe way:
     *  wrongly keeping two links leaves the user something to delete, while wrongly merging
     *  two loses one of them for good.
     */
    private static mergeLinks(
        local: ProfileData,
        remote: ProfileData,
        adoptedIds: Record<string, string>
    ): Record<string, Link> {

        const merged: Record<string, Link> = { ...remote.links };
        const claimed = this.claimedByIdentity(local.links, remote.links);
        const remoteByScope = this.indexBy(
            this.unclaimed(this.inPositionOrder(Object.values(remote.links)), claimed),
            link => this.linkKey(link, link.groupId, link.subGroupId));

        const nextPosition = this.highestPositionPerScope(
            Object.values(remote.links), link => this.scoped(link.groupId, link.subGroupId ?? ""));

        for (const link of this.inPositionOrder(Object.values(local.links))) {
            if (claimed.has(link.id)) {
                continue;   // the account holds this very record; its copy is already in merged
            }
            const groupId = this.resolve(link.groupId, adoptedIds);
            const subGroupId = link.subGroupId
                ? this.resolve(link.subGroupId, adoptedIds)
                : undefined;

            const counterpart = remoteByScope.get(this.linkKey(link, groupId, subGroupId));
            if (counterpart && !claimed.has(counterpart.id)) {
                adoptedIds[link.id] = counterpart.id;
                claimed.add(counterpart.id);
                continue;
            }
            merged[link.id] = {
                ...link,
                groupId,
                subGroupId,
                environmentId: this.resolve(link.environmentId, adoptedIds),
                position: this.nextIn(nextPosition, this.scoped(groupId, subGroupId ?? ""))
            };
        }
        return merged;
    }

    /** Identity of a link: its title and address, inside one group or subgroup. */
    private static linkKey(link: Link, groupId: string, subGroupId?: string): string {
        return this.scoped(
            this.scoped(groupId, subGroupId ?? ""),
            `${this.asName(link.title)}\u0000${this.asAddress(link.url)}`);
    }

    // -------------------------------------------------------------- comparisons

    /**
     *  Names are display text, so they are compared case-insensitively: "Work" and "work"
     *  are the same workspace to a person, and treating them otherwise produces a duplicate
     *  on every second device.
     */
    private static asName(value: string): string {
        return value.trim().toLowerCase();
    }

    /**
     *  Addresses are compared with whitespace removed but their case intact.
     *
     *  Lower-casing would be wrong: a URL path is case-sensitive, so two genuinely different
     *  pages can differ only in case, and folding them together would silently destroy one
     *  of the user's links. The cost of being strict here is at worst a visible duplicate.
     */
    private static asAddress(value: string): string {
        return value.trim();
    }

    // ------------------------------------------------------------------- helpers

    /**
     *  The identifiers both sides hold, which are the records they agree are the same record.
     *
     *  These are the pairings that need no guessing, so they are settled before any name is
     *  compared: neither end may claim such a record by name afterwards, and the local copy
     *  is dropped in favour of the account's.
     *
     *  @param local  what this device holds, keyed by identifier
     *  @param remote what the account holds, keyed by identifier
     *  @return the identifiers present on both sides
     */
    private static claimedByIdentity<RECORD extends { id: string }>(
        local: Record<string, RECORD>,
        remote: Record<string, RECORD>
    ): Set<string> {
        const claimed = new Set<string>();
        for (const id of Object.keys(local)) {
            if (remote[id]) {
                claimed.add(id);
            }
        }
        return claimed;
    }

    /** The account's records still free to be claimed by name. */
    private static unclaimed<RECORD extends { id: string }>(
        records: RECORD[], claimed: Set<string>
    ): RECORD[] {
        return records.filter(record => !claimed.has(record.id));
    }

    /** Follows an identifier the local side gave up, or leaves it alone. */
    private static resolve(id: string, adoptedIds: Record<string, string>): string {
        return adoptedIds[id] ?? id;
    }

    /** Keeps the workspace this device had open, unless the merge left it without one. */
    private static resolveActiveEnvironment(
        local: ProfileData,
        environments: Record<string, Environment>,
        adoptedIds: Record<string, string>
    ): string | null | undefined {

        const wanted = local.activeEnvironmentId
            ? this.resolve(local.activeEnvironmentId, adoptedIds)
            : null;

        if (wanted && environments[wanted]) {
            return wanted;
        }
        return this.inDisplayOrder(Object.values(environments))[0]?.id ?? null;
    }

    private static indexBy<T>(items: T[], key: (item: T) => string): Map<string, T> {
        const index = new Map<string, T>();
        // First one wins, so display order decides which of two equally named remote
        // containers a local one attaches to.
        for (const item of items) {
            if (!index.has(key(item))) {
                index.set(key(item), item);
            }
        }
        return index;
    }

    /**
     *  Joins a scope and a name into one map key.
     *
     *  The separator is a NUL rather than anything typeable, so that a group actually named
     *  "b" inside workspace "a" cannot collide with one named "a b" elsewhere.
     */
    private static scoped(outer: string, inner: string): string {
        return `${outer}\u0000${inner}`;
    }

    private static inDisplayOrder<T extends { order?: number }>(items: T[]): T[] {
        return [...items].sort((one, other) => (one.order ?? 0) - (other.order ?? 0));
    }

    private static inPositionOrder<T extends { position: number }>(items: T[]): T[] {
        return [...items].sort((one, other) => one.position - other.position);
    }

    private static highestOrder(items: { order?: number }[]): number {
        return items.reduce((highest, item) => Math.max(highest, item.order ?? 0), -1);
    }

    private static highestOrderPerScope<T extends { order?: number }>(
        items: T[], scopeOf: (item: T) => string
    ): Map<string, number> {
        const highest = new Map<string, number>();
        for (const item of items) {
            const scope = scopeOf(item);
            highest.set(scope, Math.max(highest.get(scope) ?? -1, item.order ?? 0));
        }
        return highest;
    }

    private static highestPositionPerScope<T extends { position: number }>(
        items: T[], scopeOf: (item: T) => string
    ): Map<string, number> {
        const highest = new Map<string, number>();
        for (const item of items) {
            const scope = scopeOf(item);
            highest.set(scope, Math.max(highest.get(scope) ?? -1, item.position));
        }
        return highest;
    }

    /** Hands out the next free slot in a scope, remembering what it gave away. */
    private static nextIn(highest: Map<string, number>, scope: string): number {
        const next = (highest.get(scope) ?? -1) + 1;
        highest.set(scope, next);
        return next;
    }
}
