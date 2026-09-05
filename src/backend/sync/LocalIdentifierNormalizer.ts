import { Group, Link, ProfileData, Subgroup } from "../entity/AppStateEntity";
import { uid } from "../repository/AppStateRepositoryUtils";

/** A profile's data after rewriting, and what each rewritten identifier became. */
export interface NormalizedProfileData {
    data: ProfileData;

    /** Old identifier -> new identifier, for every record that was given a new one. */
    replacements: Record<string, string>;
}

/** Matches the identifier format the backend stores: a canonical UUID. */
const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when an identifier is one the backend could store as-is. */
export function isStorableIdentifier(identifier: string): boolean {
    return UUID_PATTERN.test(identifier);
}

/**
 *  Gives records new identifiers and repoints everything that referred to the old ones.
 *
 *  Two callers need this, for reasons that look unrelated but are the same problem.
 *
 *  **Synchronisation.** The backend keys every record by a `uuid` column, and this extension
 *  has not always produced UUIDs: the profile registry seeds a profile whose identifier is
 *  the literal string "default", and the example data a first-run user loads is keyed
 *  "env-1", "group-1" and so on. Those cannot be stored server side, and a push carrying one
 *  is refused outright - so a device is normalised once, before it ever pushes.
 *
 *  **Importing a profile.** An exported file carries the identifiers it was exported with,
 *  so importing one back alongside the original produces two profiles whose records collide
 *  exactly. Regenerating every identifier on the way in makes the copy genuinely separate.
 *
 *  The difference between the two is only which records are rewritten, which is why that is
 *  a parameter rather than two nearly identical functions.
 */
export class LocalIdentifierNormalizer {

    /**
     *  Rewrites the identifiers the backend could not store, leaving the rest alone.
     *
     *  @param data the profile's data
     *  @return the rewritten data, and what changed
     */
    public static toStorableIdentifiers(data: ProfileData): NormalizedProfileData {
        return this.rewrite(data, identifier => !isStorableIdentifier(identifier));
    }

    /**
     *  Rewrites every identifier, so the result shares nothing with what it came from.
     *
     *  @param data the profile's data
     *  @return the rewritten data, and what changed
     */
    public static toFreshIdentifiers(data: ProfileData): NormalizedProfileData {
        return this.rewrite(data, () => true);
    }

    /**
     *  Rewrites the identifiers a rule selects, and repoints every reference to them.
     *
     *  @param data       the profile's data
     *  @param shouldRewrite decides, per identifier, whether it is replaced
     *  @return the rewritten data, and what changed
     */
    private static rewrite(
        data: ProfileData,
        shouldRewrite: (identifier: string) => boolean
    ): NormalizedProfileData {

        const replacements: Record<string, string> = {};

        const claim = (identifier: string): string => {
            if (!shouldRewrite(identifier)) {
                return identifier;
            }
            if (!replacements[identifier]) {
                replacements[identifier] = uid();
            }
            return replacements[identifier];
        };

        // Every identifier is claimed before anything is repointed, so a child rewritten
        // before its parent still resolves the parent to the same new identifier.
        Object.keys(data.environments).forEach(claim);
        Object.keys(data.groups).forEach(claim);
        Object.keys(data.subgroups).forEach(claim);
        Object.keys(data.links).forEach(claim);

        const follow = (identifier: string): string => replacements[identifier] ?? identifier;

        const environments: ProfileData["environments"] = {};
        for (const environment of Object.values(data.environments)) {
            const id = follow(environment.id);
            environments[id] = { ...environment, id };
        }

        const groups: Record<string, Group> = {};
        for (const group of Object.values(data.groups)) {
            const id = follow(group.id);
            groups[id] = { ...group, id, environmentId: follow(group.environmentId) };
        }

        const subgroups: Record<string, Subgroup> = {};
        for (const subgroup of Object.values(data.subgroups)) {
            const id = follow(subgroup.id);
            subgroups[id] = {
                ...subgroup,
                id,
                groupId: follow(subgroup.groupId),
                environmentId: follow(subgroup.environmentId)
            };
        }

        const links: Record<string, Link> = {};
        for (const link of Object.values(data.links)) {
            const id = follow(link.id);
            links[id] = {
                ...link,
                id,
                groupId: follow(link.groupId),
                environmentId: follow(link.environmentId),
                subGroupId: link.subGroupId ? follow(link.subGroupId) : undefined
            };
        }

        return {
            data: {
                environments,
                groups,
                subgroups,
                links,
                activeEnvironmentId: data.activeEnvironmentId
                    ? follow(data.activeEnvironmentId)
                    : data.activeEnvironmentId
            },
            replacements
        };
    }
}
