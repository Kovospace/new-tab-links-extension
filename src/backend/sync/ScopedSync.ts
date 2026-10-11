import { ProfileData } from "../entity/AppStateEntity";
import { SyncBaseline } from "./ChangeSetBuilder";
import { SyncSnapshotMapper } from "./SyncSnapshotMapper";

/**
 *  Push and pull, confined to what holds a slot (`SyncSlots.ts`).
 *
 *  **Push** compares the baseline and the device *both cut down to the scope*. Something out
 *  of scope is absent from both, so it is neither created on the account nor deleted from it.
 *
 *  **The baseline keeps what is out of scope as it was.** A workspace that stopped holding a
 *  slot (premium ended) stays in the baseline at its last synchronised state, so that when it
 *  holds one again only what was changed meanwhile is sent - and something the account never
 *  sent this device (no slot when it signed in) never enters the baseline, so it can never be
 *  read as a deletion.
 *
 *  **Pull writes only over what is in scope, and never erases what is local only.** A local
 *  workspace the snapshot does not hold is deleted only when the baseline says the account
 *  held it - deleted elsewhere - or when the server took it under another identifier. Anything
 *  else absent from the snapshot is local only (refused, or without a slot) and stays as it is.
 *  This is the fix for a pull that replaced a profile wholesale and so deleted every
 *  workspace the account had refused.
 */

/** Whether something is in scope, by its identifier. */
export type InScope = (id: string) => boolean;

/** One workspace and everything under it, as profile data of its own. */
export function workspaceSlice(data: ProfileData, workspaceId: string): ProfileData {
    const environment = data.environments[workspaceId];
    const under = <RECORD extends { environmentId: string }>(records: Record<string, RECORD>) =>
        Object.fromEntries(Object.entries(records).filter(([, record]) => record.environmentId === workspaceId));
    return {
        environments: environment ? { [workspaceId]: environment } : {},
        groups: under(data.groups),
        subgroups: under(data.subgroups),
        links: under(data.links),
        activeEnvironmentId: environment ? workspaceId : null
    };
}

/** Joins workspace slices of one profile into one. Later slices win on a shared identifier. */
export function joinSlices(slices: ProfileData[], activeEnvironmentId: string | null | undefined): ProfileData {
    const joined = SyncSnapshotMapper.emptyProfileData();
    for (const slice of slices) {
        Object.assign(joined.environments, slice.environments);
        Object.assign(joined.groups, slice.groups);
        Object.assign(joined.subgroups, slice.subgroups);
        Object.assign(joined.links, slice.links);
    }
    joined.activeEnvironmentId = activeEnvironmentId;
    return joined;
}

/** Profile data cut down to the workspaces in scope. */
export function dataWithin(data: ProfileData, inWorkspace: InScope): ProfileData {
    return joinSlices(
        Object.keys(data.environments).filter(inWorkspace).map(id => workspaceSlice(data, id)),
        data.activeEnvironmentId);
}

/** Profile data cut down to the workspaces out of scope. */
function dataOutside(data: ProfileData, inWorkspace: InScope): ProfileData {
    return dataWithin(data, id => !inWorkspace(id));
}

/**
 *  A baseline - or the device's state in the same shape - cut down to the scope.
 *
 *  @param state       what to cut down
 *  @param inProfile   whether a profile synchronises
 *  @param inWorkspace whether a workspace synchronises
 */
export function restrictToScope(state: SyncBaseline, inProfile: InScope, inWorkspace: InScope): SyncBaseline {
    const profiles = state.profiles.filter(profile => inProfile(profile.id));
    const dataByProfileId: Record<string, ProfileData> = {};
    const closedTabsByProfileId: SyncBaseline["closedTabsByProfileId"] = {};
    const visitsByProfileId: SyncBaseline["visitsByProfileId"] = {};
    for (const profile of profiles) {
        const data = state.dataByProfileId[profile.id];
        if (data) {
            dataByProfileId[profile.id] = dataWithin(data, inWorkspace);
        }
        if (state.closedTabsByProfileId?.[profile.id]) {
            closedTabsByProfileId[profile.id] = state.closedTabsByProfileId[profile.id];
        }
        if (state.visitsByProfileId?.[profile.id]) {
            visitsByProfileId[profile.id] = state.visitsByProfileId[profile.id];
        }
    }
    return { ...state, profiles, dataByProfileId, closedTabsByProfileId, visitsByProfileId };
}

/**
 *  The baseline after a confirmed exchange: what the account confirmed for everything in scope,
 *  and the previous baseline, untouched, for everything out of it.
 *
 *  @param previous    the baseline before, or null when there was none
 *  @param confirmed   the account's state within the scope
 *  @param inProfile   whether a profile synchronises
 *  @param inWorkspace whether a workspace synchronises
 *  @param exists      whether the account still has a profile or workspace; what it no longer
 *                     has is not kept from before. Everything is kept when not given.
 */
export function baselineAfter(
    previous: SyncBaseline | null, confirmed: SyncBaseline, inProfile: InScope, inWorkspace: InScope,
    exists: InScope = () => true
): SyncBaseline {
    if (!previous) {
        return confirmed;
    }
    const confirmedIds = new Set(confirmed.profiles.map(profile => profile.id));
    const profiles = [
        ...confirmed.profiles,
        ...previous.profiles.filter(profile =>
            !confirmedIds.has(profile.id) && !inProfile(profile.id) && exists(profile.id))
    ];
    const dataByProfileId: Record<string, ProfileData> = {};
    const closedTabsByProfileId: NonNullable<SyncBaseline["closedTabsByProfileId"]> = {};
    const visitsByProfileId: NonNullable<SyncBaseline["visitsByProfileId"]> = {};

    for (const profile of profiles) {
        const before = previous.dataByProfileId[profile.id];
        const now = confirmed.dataByProfileId[profile.id];
        if (confirmedIds.has(profile.id)) {
            const kept = before ? dataOutside(before, id => inWorkspace(id) || !exists(id)) : null;
            dataByProfileId[profile.id] = kept && now
                ? joinSlices([kept, now], now.activeEnvironmentId)
                : (now ?? kept ?? SyncSnapshotMapper.emptyProfileData());
            closedTabsByProfileId[profile.id] = confirmed.closedTabsByProfileId?.[profile.id]
                ?? previous.closedTabsByProfileId?.[profile.id] ?? {};
            visitsByProfileId[profile.id] = confirmed.visitsByProfileId?.[profile.id]
                ?? previous.visitsByProfileId?.[profile.id] ?? {};
        } else {
            if (before) {
                dataByProfileId[profile.id] = dataWithin(before, exists);
            }
            closedTabsByProfileId[profile.id] = previous.closedTabsByProfileId?.[profile.id] ?? {};
            visitsByProfileId[profile.id] = previous.visitsByProfileId?.[profile.id] ?? {};
        }
    }
    return {
        profiles,
        dataByProfileId,
        closedTabsByProfileId,
        closedTabsSupported: confirmed.closedTabsSupported ?? previous.closedTabsSupported,
        visitsByProfileId,
        visitsSupported: confirmed.visitsSupported ?? previous.visitsSupported
    };
}

/**
 *  One profile after a pull: the account's copy of every workspace in scope, and this device's
 *  own of everything else that is still here.
 *
 *  @param local       what this device holds, or null when it holds nothing of this profile
 *  @param incoming    what the account holds
 *  @param inWorkspace whether a workspace synchronises
 *  @param heldBefore  the workspaces the baseline says the account held; one of them absent
 *                     from `incoming` was deleted elsewhere
 *  @param dropped     identifiers the server stored under another one; their local copy goes
 */
export function pulledProfileData(
    local: ProfileData | null,
    incoming: ProfileData,
    inWorkspace: InScope,
    heldBefore: ReadonlySet<string>,
    dropped: ReadonlySet<string>
): ProfileData {
    const slices: ProfileData[] = [];
    const taken = new Set<string>();

    for (const workspaceId of Object.keys(incoming.environments)) {
        if (inWorkspace(workspaceId)) {
            slices.push(workspaceSlice(incoming, workspaceId));
            taken.add(workspaceId);
        }
    }
    for (const workspaceId of Object.keys(local?.environments ?? {})) {
        if (taken.has(workspaceId)) {
            continue;
        }
        const onAccount = workspaceId in incoming.environments;
        const goneElsewhere = !onAccount && (heldBefore.has(workspaceId) || dropped.has(workspaceId));
        if (!goneElsewhere) {
            // Local only, or the account's without a slot: this device's copy stays as it is.
            slices.push(workspaceSlice(local!, workspaceId));
        }
    }
    return joinSlices(slices, local?.activeEnvironmentId ?? null);
}
