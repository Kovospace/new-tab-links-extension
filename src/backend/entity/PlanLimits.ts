import { Group, ProfileData } from "./AppStateEntity";

/**
 *  Every limit this extension knows: the one place their numbers are written.
 *
 *  **Free** means not signed in, or signed in to an account that is not premium. **Premium**
 *  is capped by the Fair Use Policy (`/fair-use` on the website). Where the free plan has no
 *  number of its own (groups, subgroups, links) the premium one applies to it too.
 *
 *  **These numbers are only the default.** The account sends its effective limits with its
 *  standing (`GET /api/v1/users/me/plan-limits`, and `planLimits` on the sync snapshot), and
 *  those are what is enforced while signed in (`planLimits$` in `PremiumStanding.ts`). A limit
 *  changed on the server therefore needs no extension release; what is written here only
 *  governs an installation nobody is signed in to, or one that has not heard yet.
 *
 *  **Only growth is refused.** Data already over a limit - made while premium, or before a
 *  limit existed, or merged in - is never deleted, hidden or locked. It simply cannot grow
 *  until it is back under, and over a slot limit it stays local only (`SyncSlots.ts`).
 *
 *  The closed tabs history is not a slot and is never refused: it keeps its newest entries
 *  and the oldest drop off as new ones arrive (`recordClosedTab`).
 */
export interface PlanLimits {
    profiles: number;
    workspacesPerProfile: number;
    groupsPerWorkspace: number;
    subgroupsPerGroup: number;
    linksPerWorkspace: number;
    closedTabs: number;
    devices: number;
}

/** What an installation nobody is signed in to - or a free account - may hold. */
export const FREE_PLAN_LIMITS: Readonly<PlanLimits> = Object.freeze({
    profiles: 1,
    workspacesPerProfile: 2,
    groupsPerWorkspace: 25,
    subgroupsPerGroup: 25,
    linksPerWorkspace: 500,
    closedTabs: 25,
    devices: 5
});

/** What a premium account may hold: the Fair Use Policy's caps on "unlimited". */
export const PREMIUM_PLAN_LIMITS: Readonly<PlanLimits> = Object.freeze({
    profiles: 50,
    workspacesPerProfile: 50,
    groupsPerWorkspace: 25,
    subgroupsPerGroup: 25,
    linksPerWorkspace: 500,
    closedTabs: 500,
    devices: 100
});

/** The compiled default for a standing, used until the account has said otherwise. */
export function defaultPlanLimits(premium: boolean): PlanLimits {
    return { ...(premium ? PREMIUM_PLAN_LIMITS : FREE_PLAN_LIMITS) };
}

/**
 *  Reads the account's limits off the wire, keeping the default for anything missing or
 *  nonsensical - a server that leaves a number out has not lifted it.
 *
 *  @param received what the account sent, of unknown shape
 *  @param premium  the standing it came with, which picks the default to fall back on
 */
export function planLimitsFrom(received: unknown, premium: boolean): PlanLimits {
    const fallback = defaultPlanLimits(premium);
    if (!received || typeof received !== "object") {
        return fallback;
    }
    const source = received as Record<string, unknown>;
    const limits = { ...fallback };
    for (const key of Object.keys(fallback) as (keyof PlanLimits)[]) {
        const value = source[key];
        if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
            limits[key] = Math.floor(value);
        }
    }
    return limits;
}

/** A limit as the backend names it in a 409's `limit`. */
export type LimitName =
    | "PROFILES"
    | "WORKSPACES_PER_PROFILE"
    | "GROUPS_PER_WORKSPACE"
    | "SUBGROUPS_PER_GROUP"
    | "LINKS_PER_WORKSPACE"
    | "DEVICES";

/** Which number of `PlanLimits` each backend name is. */
export const LIMIT_KEYS: Readonly<Record<LimitName, keyof PlanLimits>> = Object.freeze({
    PROFILES: "profiles",
    WORKSPACES_PER_PROFILE: "workspacesPerProfile",
    GROUPS_PER_WORKSPACE: "groupsPerWorkspace",
    SUBGROUPS_PER_GROUP: "subgroupsPerGroup",
    LINKS_PER_WORKSPACE: "linksPerWorkspace",
    DEVICES: "devices"
});

/** Whether a value read off the wire is a limit name this extension knows. */
export function isLimitName(value: unknown): value is LimitName {
    return typeof value === "string" && Object.prototype.hasOwnProperty.call(LIMIT_KEYS, value);
}

/**
 *  Whose limit a refusal is, which decides what the user is offered.
 *
 *  `FREE_PLAN`: premium lifts it, so the notice offers the upgrade. `FAIR_USE`: premium does
 *  not, so the notice links to the Fair Use Policy, which says how to ask for a raise.
 */
export type RefusalKind = "FREE_PLAN" | "FAIR_USE";

/** The limits the free plan holds lower than premium does; every other is a fair use cap. */
const RAISED_BY_PREMIUM: ReadonlySet<LimitName> =
    new Set<LimitName>(["PROFILES", "WORKSPACES_PER_PROFILE", "DEVICES"]);

/**
 *  Whose limit it is for this standing. Decided by name, not by comparing numbers, so that a
 *  number changed on the server cannot change what the user is offered.
 */
export function refusalKindOf(limit: LimitName, premium: boolean): RefusalKind {
    return !premium && RAISED_BY_PREMIUM.has(limit) ? "FREE_PLAN" : "FAIR_USE";
}

/** A refusal: which limit, whose it is, and how far it goes. */
export interface LimitRefusal {
    kind: RefusalKind;
    limit: LimitName;
    maximum: number;

    /**
     *  Where the user manages what counts against the limit - the website's devices page, as
     *  the account's 409 names it. Absent on a refusal made here.
     */
    manageUrl?: string;
}

/** The refusal for a limit under these limits and this standing. */
export function refusalOf(limit: LimitName, limits: PlanLimits, premium: boolean): LimitRefusal {
    return { kind: refusalKindOf(limit, premium), limit, maximum: limits[LIMIT_KEYS[limit]] };
}

/** Whether a refusal is the free plan's - the one that offers an upgrade. */
export function isFreePlanRefusal(refusal: LimitRefusal): boolean {
    return refusal.kind === "FREE_PLAN";
}

// ------------------------------------------------------------------- counting

/** How many workspaces a profile holds. */
export function workspacesIn(data: Pick<ProfileData, "environments">): number {
    return Object.keys(data.environments).length;
}

/** How many links a workspace holds, counted the way the account stores them: by workspace. */
export function linksInWorkspace(data: Pick<ProfileData, "links">, workspaceId: string): number {
    return Object.values(data.links).filter(link => link.environmentId === workspaceId).length;
}

/** How many groups a workspace holds. */
export function groupsInWorkspace(data: Pick<ProfileData, "groups">, workspaceId: string): number {
    return Object.values(data.groups).filter(group => group.environmentId === workspaceId).length;
}

/** How many subgroups a group holds. */
export function subgroupsInGroup(data: Pick<ProfileData, "subgroups">, groupId: string): number {
    return Object.values(data.subgroups).filter(subgroup => subgroup.groupId === groupId).length;
}

// ------------------------------------------------------------- growth checks

/**
 *  Why one more profile may not be added to the `existing` ones, or null when it may.
 *
 *  @param existing how many profiles there are now
 *  @param limits   the effective limits
 *  @param premium  the standing, which decides whose limit a refusal is
 */
export function refusalOfAnotherProfile(
    existing: number, limits: PlanLimits, premium: boolean
): LimitRefusal | null {
    return existing >= limits.profiles ? refusalOf("PROFILES", limits, premium) : null;
}

/** Why one more workspace may not be added to a profile, or null when it may. */
export function refusalOfAnotherWorkspace(
    data: Pick<ProfileData, "environments">, limits: PlanLimits, premium: boolean
): LimitRefusal | null {
    return workspacesIn(data) >= limits.workspacesPerProfile
        ? refusalOf("WORKSPACES_PER_PROFILE", limits, premium)
        : null;
}

/** Why `adding` more groups may not go into a workspace, or null when they may. */
export function refusalOfMoreGroups(
    data: Pick<ProfileData, "groups">, workspaceId: string, adding: number,
    limits: PlanLimits, premium: boolean
): LimitRefusal | null {
    return adding > 0 && groupsInWorkspace(data, workspaceId) + adding > limits.groupsPerWorkspace
        ? refusalOf("GROUPS_PER_WORKSPACE", limits, premium)
        : null;
}

/** Why `adding` more subgroups may not go into a group, or null when they may. */
export function refusalOfMoreSubgroups(
    data: Pick<ProfileData, "subgroups">, groupId: string, adding: number,
    limits: PlanLimits, premium: boolean
): LimitRefusal | null {
    return adding > 0 && subgroupsInGroup(data, groupId) + adding > limits.subgroupsPerGroup
        ? refusalOf("SUBGROUPS_PER_GROUP", limits, premium)
        : null;
}

/**
 *  Why `adding` more links may not go into a workspace, or null when they may. A workspace
 *  already over the cap may not take even one more, but nothing in it is touched.
 */
export function refusalOfMoreLinks(
    data: Pick<ProfileData, "links">, workspaceId: string, adding: number,
    limits: PlanLimits, premium: boolean
): LimitRefusal | null {
    return adding > 0 && linksInWorkspace(data, workspaceId) + adding > limits.linksPerWorkspace
        ? refusalOf("LINKS_PER_WORKSPACE", limits, premium)
        : null;
}

/**
 *  The first Fair Use cap a workspace is over, or null.
 *
 *  A workspace over one cannot be synchronised: the account would refuse it, and half of it
 *  is never sent (`SyncSlots.ts`). Over, not at - a workspace exactly at a cap is full, and
 *  full is allowed.
 */
export function capExceededBy(
    data: Pick<ProfileData, "groups" | "subgroups" | "links">, workspaceId: string, limits: PlanLimits
): LimitName | null {
    const groups: Group[] = Object.values(data.groups).filter(group => group.environmentId === workspaceId);
    if (groups.length > limits.groupsPerWorkspace) {
        return "GROUPS_PER_WORKSPACE";
    }
    for (const group of groups) {
        if (subgroupsInGroup(data, group.id) > limits.subgroupsPerGroup) {
            return "SUBGROUPS_PER_GROUP";
        }
    }
    if (linksInWorkspace(data, workspaceId) > limits.linksPerWorkspace) {
        return "LINKS_PER_WORKSPACE";
    }
    return null;
}

/**
 *  The first limit a whole imported profile breaks, or null.
 *
 *  An import is growth all at once, so a file over a limit is refused whole rather than cut
 *  down - cutting would decide for the user which of their links to lose. Whether the import
 *  may add a profile at all is asked separately (`refusalOfAnotherProfile`), since a file that
 *  replaces the current profile adds none.
 */
export function limitViolationIn(data: ProfileData, limits: PlanLimits, premium: boolean): LimitRefusal | null {
    if (workspacesIn(data) > limits.workspacesPerProfile) {
        return refusalOf("WORKSPACES_PER_PROFILE", limits, premium);
    }
    for (const workspaceId of Object.keys(data.environments)) {
        const cap = capExceededBy(data, workspaceId, limits);
        if (cap) {
            return refusalOf(cap, limits, premium);
        }
    }
    // Links filed under a workspace the file does not hold still count somewhere.
    const perWorkspace = new Map<string, number>();
    for (const link of Object.values(data.links)) {
        perWorkspace.set(link.environmentId, (perWorkspace.get(link.environmentId) ?? 0) + 1);
    }
    for (const count of perWorkspace.values()) {
        if (count > limits.linksPerWorkspace) {
            return refusalOf("LINKS_PER_WORKSPACE", limits, premium);
        }
    }
    return null;
}
