import { ProfileData, ProfileMeta } from "../entity/AppStateEntity";
import { isExampleProfile, isExampleWorkspace } from "../entity/ExampleData";
import { capExceededBy, PlanLimits } from "../entity/PlanLimits";
import { AccountEnvironmentDto, AccountProfileDto, InventorySyncState } from "./SyncContracts";
import { MappedSnapshot } from "./SyncSnapshotMapper";

/**
 *  Slots: what synchronises, decided here rather than by the account refusing it.
 *
 *  **The limits are slots, and they belong to the account.** Whatever the account already
 *  holds keeps its slot; a device bringing more than the slots left gets nothing synchronised
 *  beyond them. "First" is the account's `createdAt` - when an item first reached the server -
 *  and nothing else: when something was made or last edited here does not count.
 *
 *  - Profiles: the account's first `profiles` profiles hold slots.
 *  - Workspaces: the first `workspacesPerProfile` workspaces of a slot-holding profile hold
 *    slots; a workspace under a profile without a slot holds none.
 *  - What this device has that the account does not takes a free slot if there is one, in the
 *    order it was created here.
 *
 *  **Some things never synchronise whatever the slots say**: untouched example data, and a
 *  workspace over a Fair Use cap - never half of one. A new item that fits a free slot takes it
 *  as a new item, whatever it is called; only one left without a slot is matched by name to a
 *  slot-holder (`SyncCoordinator.adoptNameMatches`), which is the rename advice the page gives.
 *
 *  Everything outside the slots stays on this device untouched and editable. Push sends only
 *  what is in scope, pull writes only over what is in scope - see `ScopedSync.ts`.
 */

/** One of the account's profiles or workspaces, as far as slots are concerned. */
export interface AccountItem {
    id: string;
    name: string;
    /** When it first reached the account, epoch milliseconds. */
    createdAt: number;
    /** Where it is listed, for an order between items created in the same millisecond. */
    position: number;
}

/** One of the account's workspaces, with the profile it is filed under. */
export interface AccountWorkspace extends AccountItem {
    profileId: string;
}

/** The account's profiles and workspaces without their content. */
export interface AccountInventory {
    profiles: AccountItem[];
    workspaces: AccountWorkspace[];
}

/** One local profile as the slot rules see it. */
export interface LocalProfile {
    meta: ProfileMeta;
    /** Null when this device holds none of its data. */
    data: ProfileData | null;
}

/** The decision for one local profile or workspace. */
export interface ItemSyncState {
    state: InventorySyncState;
    /**
     *  For something local only for want of a slot: the names of the account's slot-holders
     *  at the same level. Renamed to one of them, it merges with it on the next sync - which
     *  is the advice the page gives (first contact by name, section 6 of the design).
     */
    renameTo?: string[];
}

/** What synchronises, and why everything else does not. */
export interface SyncScope {
    /** Per local profile. */
    profiles: Record<string, ItemSyncState>;
    /** Per local workspace. */
    workspaces: Record<string, ItemSyncState>;
    /** The account's profiles that hold a slot, whether this device has them or not. */
    slotProfileIds: Set<string>;
    /** The account's workspaces that hold a slot, whether this device has them or not. */
    slotWorkspaceIds: Set<string>;
    /**
     *  What the account lets this device delete: every profile it holds, and every workspace
     *  under a slot-holding profile - slot or not. Edits inside the slot-less ones are refused,
     *  deletions are not.
     */
    deletableIds: Set<string>;
}

/** The two answers the scope needs from the account's standing. */
export interface SlotRules {
    limits: PlanLimits;
    premium: boolean;
}

/** Profiles and workspaces compare by name the way a person would. */
export function asName(value: string): string {
    return value.trim().toLowerCase();
}

/** The account's lists, as the list endpoints return them. */
export function inventoryFromLists(
    profiles: AccountProfileDto[], environments: AccountEnvironmentDto[]
): AccountInventory {
    return {
        profiles: profiles.map(profile => ({
            id: profile.id, name: profile.name, position: profile.position ?? 0,
            createdAt: toEpochMilliseconds(profile.createdAt)
        })),
        workspaces: environments.map(environment => ({
            id: environment.id, profileId: environment.profileId, name: environment.name,
            position: environment.position ?? 0,
            createdAt: toEpochMilliseconds(environment.createdAt)
        }))
    };
}

/** The account's lists, read off a snapshot that is already here. */
export function inventoryFromSnapshot(snapshot: MappedSnapshot): AccountInventory {
    const workspaces: AccountWorkspace[] = [];
    for (const [profileId, data] of Object.entries(snapshot.dataByProfileId)) {
        for (const environment of Object.values(data.environments)) {
            workspaces.push({
                id: environment.id, profileId, name: environment.name,
                position: environment.order ?? 0, createdAt: environment.createdAt
            });
        }
    }
    return {
        profiles: snapshot.profiles.map((profile, position) => ({
            id: profile.id, name: profile.name, position, createdAt: profile.createdAt
        })),
        workspaces
    };
}

/**
 *  First come, first served: oldest first, then the identifier compared as lower-case text -
 *  exactly the backend's order (Postgres sorts uuids that way). Ties are common: every row of
 *  one push shares its transaction's timestamp. Position is deliberately not used; the account
 *  does not, and the two ends must agree on who holds a slot.
 */
function bySlotOrder<ITEM extends AccountItem>(items: ITEM[]): ITEM[] {
    return [...items].sort((one, other) => {
        if (one.createdAt !== other.createdAt) {
            return one.createdAt - other.createdAt;
        }
        const first = one.id.toLowerCase();
        const second = other.id.toLowerCase();
        return first < second ? -1 : first > second ? 1 : 0;
    });
}

/** Which of the account's profiles and workspaces hold slots. */
export function slotHolders(
    account: AccountInventory, limits: PlanLimits
): { profiles: AccountItem[]; workspacesByProfile: Map<string, AccountWorkspace[]> } {
    const profiles = bySlotOrder(account.profiles).slice(0, limits.profiles);
    const workspacesByProfile = new Map<string, AccountWorkspace[]>();
    for (const profile of profiles) {
        workspacesByProfile.set(profile.id, bySlotOrder(
            account.workspaces.filter(workspace => workspace.profileId === profile.id)
        ).slice(0, limits.workspacesPerProfile));
    }
    return { profiles, workspacesByProfile };
}

/**
 *  Decides, for everything this device holds, whether it synchronises.
 *
 *  @param account what the account holds, without content
 *  @param local   what this device holds, profiles in the order they were created here
 *  @param rules   the limits in force and the standing, which words why something is left out
 */
export function decideSyncScope(account: AccountInventory, local: LocalProfile[], rules: SlotRules): SyncScope {
    const { limits, premium } = rules;
    const noSlot: InventorySyncState = premium ? "LOCAL_ONLY_FAIR_USE" : "LOCAL_ONLY_FREE_LIMIT";

    const holders = slotHolders(account, limits);
    const slotProfileIds = new Set(holders.profiles.map(profile => profile.id));
    const slotWorkspaceIds = new Set(
        [...holders.workspacesByProfile.values()].flat().map(workspace => workspace.id));
    const accountProfileIds = new Set(account.profiles.map(profile => profile.id));
    const accountWorkspaceIds = new Set(account.workspaces.map(workspace => workspace.id));

    const deletableIds = new Set([
        ...account.profiles.map(profile => profile.id),
        ...account.workspaces.filter(workspace => slotProfileIds.has(workspace.profileId)).map(workspace => workspace.id)
    ]);
    const scope: SyncScope = { profiles: {}, workspaces: {}, slotProfileIds, slotWorkspaceIds, deletableIds };
    let freeProfileSlots = Math.max(0, limits.profiles - account.profiles.length);
    const slotProfileNames = holders.profiles.map(profile => profile.name);

    for (const { meta, data } of inCreationOrder(local)) {
        let profileState: ItemSyncState;

        if (isExampleProfile(meta, data)) {
            profileState = { state: "EXAMPLE" };
        } else if (accountProfileIds.has(meta.id)) {
            profileState = slotProfileIds.has(meta.id) ? { state: "SYNCHRONISED" } : { state: noSlot };
        } else if (freeProfileSlots > 0) {
            freeProfileSlots -= 1;
            profileState = { state: "SYNCHRONISED" };
        } else {
            profileState = { state: noSlot, renameTo: slotProfileNames };
        }
        scope.profiles[meta.id] = profileState;

        decideWorkspaces(scope, data, profileState, {
            limits, noSlot, accountWorkspaceIds,
            slotWorkspaces: holders.workspacesByProfile.get(meta.id) ?? [],
            accountWorkspacesHere: account.workspaces.filter(workspace => workspace.profileId === meta.id).length
        });
    }
    return scope;
}

/** What `decideWorkspaces` needs to know beyond the profile itself. */
interface WorkspaceRules {
    limits: PlanLimits;
    noSlot: InventorySyncState;
    accountWorkspaceIds: Set<string>;
    /** The slot-holding workspaces of this profile on the account. */
    slotWorkspaces: AccountWorkspace[];
    /** How many workspaces the account files under this profile, slot or not. */
    accountWorkspacesHere: number;
}

/** Decides each workspace of one profile. */
function decideWorkspaces(
    scope: SyncScope, data: ProfileData | null,
    profileState: ItemSyncState, rules: WorkspaceRules
): void {
    if (!data) {
        return;
    }
    const workspaces = Object.values(data.environments)
        .sort((one, other) => one.createdAt - other.createdAt || (one.order ?? 0) - (other.order ?? 0));

    let freeSlots = Math.max(0, rules.limits.workspacesPerProfile - rules.accountWorkspacesHere);
    const slotIds = new Set(rules.slotWorkspaces.map(workspace => workspace.id));
    const slotNames = rules.slotWorkspaces.map(workspace => workspace.name);

    for (const workspace of workspaces) {
        let state: ItemSyncState;
        if (isExampleWorkspace(workspace)) {
            state = { state: "EXAMPLE" };
        } else if (profileState.state !== "SYNCHRONISED") {
            // A workspace under a profile without a slot holds none.
            state = { state: profileState.state === "EXAMPLE" ? rules.noSlot : profileState.state };
        } else if (capExceededBy(data, workspace.id, rules.limits)) {
            // Over a Fair Use cap - merged in, or made while the caps were higher. Never half.
            state = { state: "LOCAL_ONLY_FAIR_USE" };
        } else if (rules.accountWorkspaceIds.has(workspace.id)) {
            state = slotIds.has(workspace.id) ? { state: "SYNCHRONISED" } : { state: rules.noSlot };
        } else if (freeSlots > 0) {
            freeSlots -= 1;
            state = { state: "SYNCHRONISED" };
        } else {
            state = { state: rules.noSlot, renameTo: slotNames };
        }
        scope.workspaces[workspace.id] = state;
    }
}

/** Local profiles, oldest first: the order in which they take free slots. */
function inCreationOrder(local: LocalProfile[]): LocalProfile[] {
    return local
        .map((profile, index) => ({ profile, index }))
        .sort((one, other) => one.profile.meta.createdAt - other.profile.meta.createdAt || one.index - other.index)
        .map(({ profile }) => profile);
}

/**
 *  Whether a profile synchronises: decided so when this device holds it. When it does not -
 *  the only way it can be in the baseline and not here is that the user deleted it - whether
 *  the account lets that deletion through, slot or not.
 */
export function profileInScope(scope: SyncScope, profileId: string): boolean {
    const decided = scope.profiles[profileId];
    return decided ? decided.state === "SYNCHRONISED" : scope.deletableIds.has(profileId);
}

/** The same question for a workspace. */
export function workspaceInScope(scope: SyncScope, workspaceId: string): boolean {
    const decided = scope.workspaces[workspaceId];
    return decided ? decided.state === "SYNCHRONISED" : scope.deletableIds.has(workspaceId);
}

function toEpochMilliseconds(instant: string): number {
    const parsed = Date.parse(instant);
    return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}
