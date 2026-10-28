import { Environment, ProfileData, ProfileMeta } from "./AppStateEntity";

/**
 *  Example data: what the first-run screen loads to show what the page does.
 *
 *  **A flag says it is still the example.** A workspace carries `example`, the fingerprint of
 *  the template it was loaded as; a profile carries `example: true` when it was the seeded
 *  profile the examples were loaded into. While a workspace is still a 1:1 copy of its
 *  template - same structure, same order, same names and addresses - it is example data.
 *
 *  **Any change the user makes clears it for good.** Every save of the profile compares each
 *  flagged workspace against its fingerprint (`withExampleFlagsSettled`, run by
 *  `AppStateRepository.save`), and the first difference removes the flag. Changing it back
 *  does not bring the flag back: the data became the user's the moment they touched it.
 *
 *  **Example data is never synchronised** (`SyncSlots.ts` leaves it out), is shown as example
 *  data on screen, and untouched example data is removed when the installation signs in to an
 *  account (`removeUntouchedExamples`). While it is here it counts toward the local limits like
 *  anything else - it is real data on that screen.
 *
 *  What is compared deliberately leaves out what is not the user's content: identifiers,
 *  creation times, which workspace is open and whether a subgroup is folded right now.
 */

/**
 *  The fingerprint of one workspace's content: its name, its groups in order, and every
 *  group's links and subgroups in the order they are drawn.
 *
 *  @param data        the profile holding the workspace
 *  @param workspaceId which workspace
 */
export function exampleFingerprintOf(data: ProfileData, workspaceId: string): string {
    const workspace = data.environments[workspaceId];
    if (!workspace) {
        return "";
    }
    const groups = Object.values(data.groups)
        .filter(group => group.environmentId === workspaceId)
        .sort((one, other) => (one.order ?? 0) - (other.order ?? 0));

    const describedGroups = groups.map(group => {
        const subgroups = Object.values(data.subgroups)
            .filter(subgroup => subgroup.groupId === group.id)
            .sort((one, other) => one.position - other.position);
        const subgroupIndex = new Map(subgroups.map((subgroup, index) => [subgroup.id, index]));
        // Root-level links first, then each subgroup's in the subgroups' order - never by the
        // subgroup's identifier, which differs between two loads of the same template.
        const sequenceOf = (subGroupId?: string): number =>
            subGroupId ? subgroupIndex.get(subGroupId) ?? subgroups.length : -1;
        const links = Object.values(data.links)
            .filter(link => link.groupId === group.id)
            .sort((one, other) =>
                sequenceOf(one.subGroupId) - sequenceOf(other.subGroupId) || one.position - other.position)
            .map(link => [
                link.title, link.url, link.position,
                link.subGroupId ? subgroupIndex.get(link.subGroupId) ?? -1 : null
            ]);
        return [
            group.title, group.description ?? "",
            subgroups.map(subgroup => [
                subgroup.title, subgroup.description ?? "", subgroup.position,
                subgroup.defaultCollapsed, subgroup.color ?? "", subgroup.catchLinksIntoTabGroup ?? false
            ]),
            links
        ];
    });
    return JSON.stringify([workspace.name, workspace.description ?? "", describedGroups]);
}

/**
 *  Flags every workspace in freshly built example data as example data.
 *
 *  @param data the template, exactly as the first-run screen is about to store it
 *  @return the same data, each workspace carrying its fingerprint
 */
export function markedAsExample(data: ProfileData): ProfileData {
    const environments: Record<string, Environment> = {};
    for (const [id, workspace] of Object.entries(data.environments)) {
        environments[id] = { ...workspace, example: exampleFingerprintOf(data, id) };
    }
    return { ...data, environments };
}

/** Whether a workspace is still untouched example data. */
export function isExampleWorkspace(workspace: Environment | undefined): boolean {
    return typeof workspace?.example === "string";
}

/**
 *  Whether a profile is still untouched example data: flagged, holding at least one
 *  workspace, and every one of them still example data.
 *
 *  @param profile its registry entry
 *  @param data    what it holds; null when this device holds none
 */
export function isExampleProfile(profile: ProfileMeta, data: ProfileData | null): boolean {
    if (profile.example !== true || !data) {
        return false;
    }
    const workspaces = Object.values(data.environments);
    return workspaces.length > 0 && workspaces.every(isExampleWorkspace);
}

/**
 *  Clears the flag of every example workspace whose content no longer matches the template it
 *  was loaded as. Returns the very same object when nothing changed, so that a save of
 *  untouched data does not produce a new state.
 *
 *  @param data what is about to be stored
 */
export function withExampleFlagsSettled<DATA extends ProfileData>(data: DATA): DATA {
    let environments: Record<string, Environment> | null = null;

    for (const [id, workspace] of Object.entries(data.environments)) {
        if (!isExampleWorkspace(workspace)) {
            continue;
        }
        if (exampleFingerprintOf(data, id) !== workspace.example) {
            environments = environments ?? { ...data.environments };
            const { example: _cleared, ...ownWorkspace } = workspace;
            environments[id] = ownWorkspace;
        }
    }
    return environments ? { ...data, environments } : data;
}

/**
 *  The profile's data without its untouched example workspaces and everything under them.
 *
 *  @param data what the profile holds
 *  @return what is left, and whether anything was removed
 */
export function withoutExampleWorkspaces(data: ProfileData): { data: ProfileData; removed: number } {
    const examples = new Set(Object.values(data.environments)
        .filter(isExampleWorkspace)
        .map(workspace => workspace.id));
    if (examples.size === 0) {
        return { data, removed: 0 };
    }
    const keep = <RECORD extends { environmentId: string }>(records: Record<string, RECORD>) =>
        Object.fromEntries(Object.entries(records).filter(([, record]) => !examples.has(record.environmentId)));

    const environments = Object.fromEntries(
        Object.entries(data.environments).filter(([id]) => !examples.has(id)));
    const remaining = Object.keys(environments);

    return {
        data: {
            environments,
            groups: keep(data.groups),
            subgroups: keep(data.subgroups),
            links: keep(data.links),
            activeEnvironmentId: data.activeEnvironmentId && environments[data.activeEnvironmentId]
                ? data.activeEnvironmentId
                : remaining[0] ?? null
        },
        removed: examples.size
    };
}
