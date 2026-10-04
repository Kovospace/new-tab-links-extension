import { ProfileData } from "./AppStateEntity";
import {
    canAddProfile,
    canAddWorkspace,
    FairUseRefusal,
    fairUseRefusalOf,
    fairUseViolationIn
} from "./FairUseLimits";

/**
 *  The free plan's limits: the one place their numbers are written.
 *
 *  They are what the website advertises for the free plan, and what the backend enforces on a
 *  free account, refusing with HTTP 409 and the code `FREE_PLAN_LIMIT_REACHED`. The names are
 *  the backend's `limit` values exactly, so a refusal read off the wire indexes this table.
 *
 *  **Free means not premium**: nobody signed in, or an account whose last known standing is
 *  not premium (`AccountStandingRepository`, published through `premiumStanding$`). Premium
 *  lifts these, and the fair use limits (`FAIR_USE_LIMITS`) cap it instead. Links have no free
 *  limit of their own; the fair use one applies on every plan.
 *
 *  **Only growth is refused**, as with fair use. A lapsed premium user, or somebody who made
 *  more before signing in, keeps every workspace and profile, all of them editable; only
 *  another one is refused until they are back under.
 *
 *  `DEVICES` is never counted here - one installation cannot see the others. The account
 *  counts them and refuses a sign-in past the limit; this number only words that refusal
 *  when the body carries none.
 */
export const FREE_PLAN_LIMITS = {
    WORKSPACES: 2,
    PROFILES: 1,
    DEVICES: 5
} as const;

/** Which free plan limit was reached, named as the backend names it. */
export type FreePlanLimit = keyof typeof FREE_PLAN_LIMITS;

/** A refusal under the free plan: what could not grow, and how far it may without premium. */
export interface FreePlanRefusal {
    plan: "FREE";
    limit: FreePlanLimit;
    maximum: number;
}

/** Any limit's refusal: the fair use one (every plan) or the free plan's. */
export type LimitRefusal = FairUseRefusal | FreePlanRefusal;

/** Whether a value read off the wire is one of the free plan limits this extension knows. */
export function isFreePlanLimit(value: unknown): value is FreePlanLimit {
    return typeof value === "string" && Object.prototype.hasOwnProperty.call(FREE_PLAN_LIMITS, value);
}

/** The refusal for a free plan limit, with this extension's number for it. */
export function freePlanRefusalOf(limit: FreePlanLimit): FreePlanRefusal {
    return { plan: "FREE", limit, maximum: FREE_PLAN_LIMITS[limit] };
}

/** Whether a refusal is the free plan's - the one that offers an upgrade. */
export function isFreePlanRefusal(refusal: LimitRefusal): refusal is FreePlanRefusal {
    return "plan" in refusal && refusal.plan === "FREE";
}

/**
 *  Why one more workspace may not be added, or null when it may.
 *
 *  The fair use limit is asked first: it binds on every plan, and a premium user is never
 *  offered an upgrade they already have.
 *
 *  @param data    the profile being added to
 *  @param premium the last known standing; false when nobody is signed in
 */
export function refusalOfAnotherWorkspace(
    data: Pick<ProfileData, "environments">,
    premium: boolean
): LimitRefusal | null {
    if (!canAddWorkspace(data)) {
        return fairUseRefusalOf("WORKSPACES");
    }
    if (!premium && Object.keys(data.environments).length >= FREE_PLAN_LIMITS.WORKSPACES) {
        return freePlanRefusalOf("WORKSPACES");
    }
    return null;
}

/**
 *  Why one more profile may not be added to the `existing` ones, or null when it may.
 *
 *  @param existing how many profiles there are now
 *  @param premium  the last known standing; false when nobody is signed in
 */
export function refusalOfAnotherProfile(existing: number, premium: boolean): LimitRefusal | null {
    if (!canAddProfile(existing)) {
        return fairUseRefusalOf("PROFILES");
    }
    if (!premium && existing >= FREE_PLAN_LIMITS.PROFILES) {
        return freePlanRefusalOf("PROFILES");
    }
    return null;
}

/**
 *  The first limit a whole imported profile breaks under the current plan, or null.
 *
 *  An import is growth all at once, so a file over a limit is refused whole rather than cut
 *  down. Whether the import may add a profile at all is asked separately
 *  (`refusalOfAnotherProfile`), since a file that replaces the current profile adds none.
 *
 *  @param data    the profile data read from the file
 *  @param premium the last known standing
 */
export function limitViolationIn(data: ProfileData, premium: boolean): LimitRefusal | null {
    const fairUse = fairUseViolationIn(data);
    if (fairUse) {
        return fairUse;
    }
    if (!premium && Object.keys(data.environments).length > FREE_PLAN_LIMITS.WORKSPACES) {
        return freePlanRefusalOf("WORKSPACES");
    }
    return null;
}
