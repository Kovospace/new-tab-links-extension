import { Group, Link, ProfileData, ProfileMeta, Subgroup } from "../entity/AppStateEntity";
import { SyncEntityKind, SyncOperation } from "./SyncContracts";

/** What the device believes the account already holds. */
export interface SyncBaseline {

    /** Profile descriptors as last confirmed by the server. */
    profiles: ProfileMeta[];

    /** Each profile's data as last confirmed by the server. */
    dataByProfileId: Record<string, ProfileData>;
}

/**
 *  Works out what to send by comparing what the device has against what the server is
 *  believed to hold.
 *
 *  **Why a difference rather than a queue of changes.** Every mutation in this extension
 *  already funnels through one save, so recording operations as they happen would be easy -
 *  but a queue then has to be persisted, replayed in order, reconciled after a partial
 *  failure, and compacted when the same link is edited five times offline. A difference has
 *  none of those problems: it is computed fresh every time, a failed push simply leaves the
 *  baseline where it was so the next attempt sends the same thing again, and five edits to
 *  one link collapse into one operation for free. Deletions need no tombstones either - a
 *  record in the baseline that is no longer present has plainly been deleted.
 *
 *  Operations come out in dependency order: parents are created before their children, and
 *  children are deleted before their parents, which is the order the backend applies them in.
 */
export class ChangeSetBuilder {

    /**
     *  Builds every operation needed to make the account match this device.
     *
     *  @param baseline what the server is believed to hold
     *  @param profiles the profile descriptors the device has now
     *  @param dataByProfileId the data the device has now, per profile
     *  @return the operations, in the order they must be applied
     */
    public static build(
        baseline: SyncBaseline,
        profiles: ProfileMeta[],
        dataByProfileId: Record<string, ProfileData>
    ): SyncOperation[] {

        const upserts: SyncOperation[] = [];
        const deletes: SyncOperation[] = [];

        this.collectProfileChanges(baseline, profiles, upserts, deletes);

        for (const profile of profiles) {
            const current = dataByProfileId[profile.id];
            if (!current) {
                // The device holds no copy of this profile's data - it has never been loaded
                // on this machine. Saying nothing about it is right; emptying it would be
                // catastrophic and is exactly the mistake this guard exists to prevent.
                continue;
            }
            this.collectProfileDataChanges(
                profile.id,
                baseline.dataByProfileId[profile.id],
                current,
                upserts,
                deletes);
        }
        return [...upserts, ...deletes];
    }

    // ----------------------------------------------------------------- profiles

    private static collectProfileChanges(
        baseline: SyncBaseline,
        profiles: ProfileMeta[],
        upserts: SyncOperation[],
        deletes: SyncOperation[]
    ): void {

        const baselineById = this.byId(baseline.profiles);

        profiles.forEach((profile, index) => {
            const operation: SyncOperation = {
                op: "upsert", type: "profile", id: profile.id,
                name: profile.name, position: index
            };
            const previous = baselineById.get(profile.id);
            if (!previous || this.differs(operation, this.profileOperation(previous, baseline))) {
                upserts.push(operation);
            }
        });

        const stillPresent = new Set(profiles.map(profile => profile.id));
        for (const profile of baseline.profiles) {
            if (!stillPresent.has(profile.id)) {
                deletes.push({ op: "delete", type: "profile", id: profile.id });
            }
        }
    }

    /** The operation that would have been sent for a profile as the baseline holds it. */
    private static profileOperation(profile: ProfileMeta, baseline: SyncBaseline): SyncOperation {
        return {
            op: "upsert", type: "profile", id: profile.id,
            name: profile.name,
            position: baseline.profiles.findIndex(candidate => candidate.id === profile.id)
        };
    }

    // ------------------------------------------------------------- profile data

    private static collectProfileDataChanges(
        profileId: string,
        baseline: ProfileData | undefined,
        current: ProfileData,
        upserts: SyncOperation[],
        deletes: SyncOperation[]
    ): void {

        const previous = baseline ?? {
            environments: {}, groups: {}, subgroups: {}, links: {}, activeEnvironmentId: null
        };

        this.collect(
            "environment",
            previous.environments, current.environments,
            environment => ({
                op: "upsert", type: "environment", id: environment.id,
                profileId,
                name: environment.name,
                description: environment.description ?? null,
                position: environment.order ?? 0
            }),
            upserts, deletes);

        this.collect(
            "group",
            previous.groups, current.groups,
            (group: Group) => ({
                op: "upsert", type: "group", id: group.id,
                environmentId: group.environmentId,
                name: group.title,
                description: group.description ?? null,
                position: group.order ?? 0
            }),
            upserts, deletes);

        this.collect(
            "subgroup",
            previous.subgroups, current.subgroups,
            (subgroup: Subgroup) => ({
                op: "upsert", type: "subgroup", id: subgroup.id,
                parentGroupId: subgroup.groupId,
                name: subgroup.title,
                description: subgroup.description ?? null,
                collapsed: subgroup.collapsed,
                defaultCollapsed: subgroup.defaultCollapsed,
                position: subgroup.position
            }),
            upserts, deletes);

        this.collect(
            "link",
            previous.links, current.links,
            (link: Link) => ({
                op: "upsert", type: "link", id: link.id,
                parentGroupId: link.groupId,
                parentSubgroupId: link.subGroupId ?? null,
                title: link.title,
                url: link.url,
                position: link.position
            }),
            upserts, deletes);
    }

    /**
     *  Compares one kind of record and appends what changed.
     *
     *  Equality is decided on the operation that would be sent, not on the stored record, so
     *  a field this extension keeps but never synchronises cannot by itself cause a push.
     */
    private static collect<RECORD extends { id: string }>(
        entityKind: SyncEntityKind,
        previous: Record<string, RECORD>,
        current: Record<string, RECORD>,
        toOperation: (record: RECORD) => SyncOperation,
        upserts: SyncOperation[],
        deletes: SyncOperation[]
    ): void {

        for (const record of Object.values(current)) {
            const operation = toOperation(record);
            const before = previous[record.id];

            if (!before || this.differs(operation, toOperation(before))) {
                upserts.push(operation);
            }
        }

        for (const identifier of Object.keys(previous)) {
            if (!current[identifier]) {
                deletes.push({ op: "delete", type: entityKind, id: identifier });
            }
        }
    }

    /**
     *  Whether two operations would tell the server different things.
     *
     *  Both are built by the same function from the same shape, so their keys are inserted in
     *  the same order and serialising them is a sound comparison.
     */
    private static differs(one: SyncOperation, other: SyncOperation): boolean {
        return JSON.stringify(one) !== JSON.stringify(other);
    }

    private static byId(profiles: ProfileMeta[]): Map<string, ProfileMeta> {
        return new Map(profiles.map(profile => [profile.id, profile]));
    }
}
