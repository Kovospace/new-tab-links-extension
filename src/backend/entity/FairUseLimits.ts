import { ProfileData } from "./AppStateEntity";

/**
 *  The fair use limits: the one place their numbers are written.
 *
 *  They are the website's published Fair Use Policy (`/fair-use`) and the backend's
 *  enforcement of it, which refuses a push breaking one with HTTP 409 and the code
 *  `FAIR_USE_LIMIT_REACHED`. The names are the backend's `limit` values exactly, so a refusal
 *  read off the wire indexes this table without translation.
 *
 *  **They cap premium's "unlimited"; they are not the free plan's limits.** The links limit
 *  applies on every plan. The free plan's own lower numbers on workspaces and profiles are in
 *  `FreePlanLimits.ts`, which also decides which of the two binds for the current plan.
 *
 *  **Only growth is refused.** Data already over a limit - made before the limit existed, or
 *  imported - is never deleted or hidden; it simply cannot grow until it is back under.
 *  The closed tabs history is the exception that proves it: it is a log, not data, and keeps
 *  its newest entries, older ones dropping off as new ones arrive (`recordClosedTab`).
 */
export const FAIR_USE_LIMITS = {
    LINKS_PER_WORKSPACE: 500,
    WORKSPACES: 50,
    PROFILES: 50,
    CLOSED_TAB_HISTORY: 500
} as const;

/** Which limit was reached, named as the backend names it. */
export type FairUseLimit = keyof typeof FAIR_USE_LIMITS;

/** A refusal: what could not grow, and how far it may. */
export interface FairUseRefusal {
    limit: FairUseLimit;
    maximum: number;
}

/** Whether a value read off the wire is one of the limits this extension knows. */
export function isFairUseLimit(value: unknown): value is FairUseLimit {
    return typeof value === "string" && Object.prototype.hasOwnProperty.call(FAIR_USE_LIMITS, value);
}

/** The refusal for a limit, with this extension's number for it. */
export function fairUseRefusalOf(limit: FairUseLimit): FairUseRefusal {
    return { limit, maximum: FAIR_USE_LIMITS[limit] };
}

/** How many links a workspace holds, counted the way the account stores them: by workspace. */
export function linksInWorkspace(data: Pick<ProfileData, "links">, workspaceId: string): number {
    return Object.values(data.links).filter(link => link.environmentId === workspaceId).length;
}

/**
 *  Whether `adding` more links may go into a workspace.
 *
 *  Refused only when the result would be over the limit - a workspace already over it may
 *  not take even one more, but nothing in it is touched.
 */
export function canAddLinksToWorkspace(
    data: Pick<ProfileData, "links">,
    workspaceId: string,
    adding: number = 1
): boolean {
    return linksInWorkspace(data, workspaceId) + adding <= FAIR_USE_LIMITS.LINKS_PER_WORKSPACE;
}

/** Whether one more workspace may be added. */
export function canAddWorkspace(data: Pick<ProfileData, "environments">): boolean {
    return Object.keys(data.environments).length < FAIR_USE_LIMITS.WORKSPACES;
}

/** Whether one more profile may be added to the `existing` ones. */
export function canAddProfile(existing: number): boolean {
    return existing < FAIR_USE_LIMITS.PROFILES;
}

/**
 *  The first limit a whole profile's data breaks, or null.
 *
 *  For imports: a file brings a profile in at once, so it is all growth, and a file over a
 *  limit is refused rather than cut down - cutting would decide for the user which of their
 *  links to lose.
 */
export function fairUseViolationIn(data: ProfileData): FairUseRefusal | null {
    if (Object.keys(data.environments).length > FAIR_USE_LIMITS.WORKSPACES) {
        return fairUseRefusalOf("WORKSPACES");
    }
    const perWorkspace = new Map<string, number>();
    for (const link of Object.values(data.links)) {
        perWorkspace.set(link.environmentId, (perWorkspace.get(link.environmentId) ?? 0) + 1);
    }
    for (const count of perWorkspace.values()) {
        if (count > FAIR_USE_LIMITS.LINKS_PER_WORKSPACE) {
            return fairUseRefusalOf("LINKS_PER_WORKSPACE");
        }
    }
    return null;
}
