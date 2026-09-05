import { Environment, Group, Link, ProfileData, ProfileMeta, Subgroup } from "../entity/AppStateEntity";
import { SyncSnapshot } from "./SyncContracts";

/** One account's data, taken apart into the profiles this extension stores separately. */
export interface MappedSnapshot {

    /** Profile descriptors, for the profile registry. */
    profiles: ProfileMeta[];

    /** Each profile's own data, keyed by profile identifier. */
    dataByProfileId: Record<string, ProfileData>;
}

/**
 *  Turns the backend's flat snapshot into the shape this extension stores.
 *
 *  Three differences between the two models are resolved here, and nowhere else:
 *
 *  - **Naming.** The server says `name` and `position` throughout; locally an environment
 *    and a group carry `title`/`order` instead. Neither side is going to change, so the
 *    translation lives in one file.
 *  - **Derived fields.** A link locally repeats the `environmentId` of its group, and every
 *    group item carries a `type` discriminator the UI switches on. Neither is stored server
 *    side; both are reconstructed here.
 *  - **Device-local fields.** `activeEnvironmentId` is not synchronised - two machines may
 *    sit on different workspaces - so it is left empty here and filled in by the caller from
 *    what the device already had.
 */
export class SyncSnapshotMapper {

    /**
     *  Splits a snapshot into per-profile data.
     *
     *  @param snapshot as returned by GET /api/v1/sync/snapshot
     *  @return the profile descriptors and one ProfileData per profile
     */
    public static toProfiles(snapshot: SyncSnapshot): MappedSnapshot {

        const profiles: ProfileMeta[] = snapshot.profiles
            .slice()
            .sort((one, other) => one.position - other.position)
            .map(profile => ({
                id: profile.id,
                name: profile.name,
                createdAt: this.toEpochMilliseconds(profile.createdAt)
            }));

        const dataByProfileId: Record<string, ProfileData> = {};
        for (const profile of profiles) {
            dataByProfileId[profile.id] = this.emptyProfileData();
        }

        // An environment names its profile, and everything below it is reached through the
        // environment, so one pass down the hierarchy places every record.
        const profileIdByEnvironmentId: Record<string, string> = {};
        const environmentIdByGroupId: Record<string, string> = {};
        const groupIdBySubgroupId: Record<string, string> = {};

        for (const environment of snapshot.environments) {
            const data = dataByProfileId[environment.profileId];
            if (!data) {
                continue;
            }
            profileIdByEnvironmentId[environment.id] = environment.profileId;
            data.environments[environment.id] = {
                id: environment.id,
                name: environment.name,
                description: environment.description ?? undefined,
                createdAt: this.toEpochMilliseconds(environment.createdAt),
                order: environment.position
            } satisfies Environment;
        }

        for (const group of snapshot.groups) {
            const profileId = profileIdByEnvironmentId[group.environmentId];
            const data = profileId ? dataByProfileId[profileId] : undefined;
            if (!data) {
                continue;
            }
            environmentIdByGroupId[group.id] = group.environmentId;
            data.groups[group.id] = {
                id: group.id,
                title: group.name,
                description: group.description ?? undefined,
                environmentId: group.environmentId,
                createdAt: this.toEpochMilliseconds(group.createdAt),
                order: group.position
            } satisfies Group;
        }

        for (const subgroup of snapshot.subgroups) {
            const environmentId = environmentIdByGroupId[subgroup.parentGroupId];
            const profileId = environmentId ? profileIdByEnvironmentId[environmentId] : undefined;
            const data = profileId ? dataByProfileId[profileId] : undefined;
            if (!data || !environmentId) {
                continue;
            }
            groupIdBySubgroupId[subgroup.id] = subgroup.parentGroupId;
            data.subgroups[subgroup.id] = {
                id: subgroup.id,
                title: subgroup.name,
                description: subgroup.description ?? undefined,
                environmentId,
                groupId: subgroup.parentGroupId,
                type: "subgroup",
                position: subgroup.position,
                createdAt: this.toEpochMilliseconds(subgroup.createdAt),
                collapsed: subgroup.collapsed,
                defaultCollapsed: subgroup.defaultCollapsed
            } satisfies Subgroup;
        }

        for (const link of snapshot.links) {
            const environmentId = environmentIdByGroupId[link.parentGroupId];
            const profileId = environmentId ? profileIdByEnvironmentId[environmentId] : undefined;
            const data = profileId ? dataByProfileId[profileId] : undefined;
            if (!data || !environmentId) {
                continue;
            }
            data.links[link.id] = {
                id: link.id,
                title: link.title,
                url: link.url,
                environmentId,
                groupId: link.parentGroupId,
                subGroupId: link.parentSubgroupId ?? undefined,
                type: "link",
                position: link.position,
                createdAt: this.toEpochMilliseconds(link.createdAt)
            } satisfies Link;
        }

        return { profiles, dataByProfileId };
    }

    /** A profile with nothing in it, and no workspace chosen. */
    public static emptyProfileData(): ProfileData {
        return {
            environments: {},
            groups: {},
            subgroups: {},
            links: {},
            activeEnvironmentId: null
        };
    }

    /**
     *  The server timestamps in ISO-8601; locally they are epoch milliseconds.
     *  An unreadable value becomes "now" rather than NaN, which would poison every sort.
     */
    private static toEpochMilliseconds(instant: string): number {
        const parsed = Date.parse(instant);
        return Number.isNaN(parsed) ? Date.now() : parsed;
    }
}
