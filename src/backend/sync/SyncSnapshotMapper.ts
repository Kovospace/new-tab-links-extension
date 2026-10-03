import { Environment, Group, Link, ProfileData, ProfileMeta, Subgroup } from "../entity/AppStateEntity";
import { DEFAULT_PROFILE_SETTINGS, settingsOf } from "../entity/ProfileSettings";
import { ClosedTab } from "../entity/ClosedTabEntity";
import { isTabGroupColor } from "../entity/TabGroupColors";
import { SyncSnapshot } from "./SyncContracts";

/** One account's data, taken apart into the profiles this extension stores separately. */
export interface MappedSnapshot {

    /** Profile descriptors, for the profile registry. */
    profiles: ProfileMeta[];

    /** Each profile's own data, keyed by profile identifier. */
    dataByProfileId: Record<string, ProfileData>;

    /**
     *  Each profile's closed tabs, keyed by profile identifier and then by tab identifier.
     *
     *  Apart from the data because they are stored apart: the service worker owns that key.
     */
    closedTabsByProfileId: Record<string, Record<string, ClosedTab>>;

    /**
     *  Whether this account stores closed tabs at all.
     *
     *  An absent collection is not an empty one. A backend that does not know about closed
     *  tabs sends no collection, and reading that as "the account has none" is what made this
     *  device push its own on every synchronisation - to a server whose vocabulary has no such
     *  record, so the whole batch was refused and nothing else synchronised either - and wipe
     *  its own list on every pull.
     */
    closedTabsSupported: boolean;
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
                createdAt: this.toEpochMilliseconds(profile.createdAt),
                // Settings ride on the profile record. A backend that does not store them
                // yet says nothing, and settingsOf() reads that as the defaults rather than
                // as an instruction to turn anything on or off.
                settings: settingsOf({
                    settings: {
                        enableDragAndDrop: profile.enableDragAndDrop
                            ?? DEFAULT_PROFILE_SETTINGS.enableDragAndDrop,
                        hideTips: profile.hideTips ?? DEFAULT_PROFILE_SETTINGS.hideTips,
                        // As the account holds it, order included - see ProfileSettings.
                        dismissedTips: profile.dismissedTips
                            ?? DEFAULT_PROFILE_SETTINGS.dismissedTips
                    }
                })
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
                defaultCollapsed: subgroup.defaultCollapsed,
                catchLinksIntoTabGroup: subgroup.catchLinksIntoTabGroup ?? false,
                // Anything the account holds that this version does not recognise is dropped
                // rather than kept: the colour is handed to chrome.tabGroups, which refuses a
                // name it does not know, and a subgroup with none is simply given one.
                color: isTabGroupColor(subgroup.color) ? subgroup.color : undefined
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

        // Closed tabs, grouped by the profile each names. A tab naming a profile that is not
        // in the snapshot is dropped rather than kept under a profile that does not exist -
        // the backend cascades them away with the profile, so one here is a straggler.
        const knownProfiles = new Set(profiles.map(profile => profile.id));
        const closedTabsByProfileId: Record<string, Record<string, ClosedTab>> = {};
        for (const profile of profiles) {
            closedTabsByProfileId[profile.id] = {};
        }

        for (const tab of snapshot.closedTabs ?? []) {
            if (!knownProfiles.has(tab.profileId)) {
                continue;
            }
            closedTabsByProfileId[tab.profileId][tab.id] = {
                id: tab.id,
                url: tab.url,
                title: tab.title ?? "",
                faviconUrl: tab.faviconUrl ?? undefined,
                closedAt: this.toEpochMilliseconds(tab.closedAt),
                deviceName: tab.deviceName ?? undefined
            } satisfies ClosedTab;
        }

        return {
            profiles,
            dataByProfileId,
            closedTabsByProfileId,
            // Present but empty is an account with no closed tabs; absent is an account that
            // does not keep them. The two must not be confused - see closedTabsSupported.
            closedTabsSupported: snapshot.closedTabs !== undefined
        };
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
