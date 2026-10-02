import { AppState, Environment, Group, Link, ProfileData, Subgroup } from "../../src/backend/entity/AppStateEntity";
import { appStateInit, buildExampleProfileData } from "../../src/backend/datasource/init/AppStateInit";

/**
 *  Builders for the profile shapes the synchronisation tests compare.
 *
 *  ProfileData is four flat maps keyed by identifier, which is convenient for the code and
 *  unreadable when written out by hand in a test: the identifier appears twice per record, and a
 *  test that gets one of the two wrong tests nothing. These builders key each map off the record
 *  itself, so that cannot happen, and let a test state only the fields it actually cares about.
 */

/** An empty profile, the thing every fixture starts from. */
export function emptyProfile(): ProfileData {
    return {
        environments: {},
        groups: {},
        subgroups: {},
        links: {},
        activeEnvironmentId: null
    };
}

/** Collects records into the map ProfileData holds them in. */
function byId<RECORD extends { id: string }>(records: RECORD[]): Record<string, RECORD> {
    return Object.fromEntries(records.map(record => [record.id, record]));
}

/** Assembles a profile from loose records, working out the maps. */
export function profileOf(parts: {
    environments?: Environment[];
    groups?: Group[];
    subgroups?: Subgroup[];
    links?: Link[];
    activeEnvironmentId?: string | null;
}): ProfileData {
    return {
        environments: byId(parts.environments ?? []),
        groups: byId(parts.groups ?? []),
        subgroups: byId(parts.subgroups ?? []),
        links: byId(parts.links ?? []),
        activeEnvironmentId: parts.activeEnvironmentId ?? null
    };
}

export function environment(id: string, name: string, order = 0): Environment {
    return { id, name, createdAt: 0, order };
}

export function group(id: string, title: string, environmentId: string, order = 0): Group {
    return { id, title, environmentId, createdAt: 0, order };
}

export function subgroup(
    id: string, title: string, groupId: string, environmentId: string, position = 0,
    extras: { catchLinksIntoTabGroup?: boolean } = {}
): Subgroup {
    return {
        id, title, groupId, environmentId, position, createdAt: 0,
        type: "subgroup", collapsed: false, defaultCollapsed: false,
        catchLinksIntoTabGroup: extras.catchLinksIntoTabGroup ?? false
    };
}

export function link(
    id: string,
    title: string,
    url: string,
    groupId: string,
    environmentId: string,
    extras: { subGroupId?: string; position?: number } = {}
): Link {
    return {
        id, title, url, groupId, environmentId,
        subGroupId: extras.subGroupId,
        position: extras.position ?? 0,
        createdAt: 0,
        type: "link"
    };
}

/**
 *  A device that already holds links: the empty first-run state with the example set loaded.
 *
 *  Fresh installs start empty now, so a test that needs "this browser has links of its own"
 *  says so here rather than relying on the seed, which used to be a developer's test data.
 */
export function stateWithLinks(): AppState {
    return { ...appStateInit, ...buildExampleProfileData() };
}
