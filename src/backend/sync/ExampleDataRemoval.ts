import { ProfileData } from "../entity/AppStateEntity";
import { withoutExampleWorkspaces } from "../entity/ExampleData";
import { AppStateRepository } from "../repository/AppStateRepository";
import { ProfileRepository } from "../repository/ProfileRepository";
import { Logger } from "../../utils/logger";

const LOG = new Logger("ExampleDataRemoval");

/**
 *  Removes untouched example data, because the installation is signing in to an account.
 *
 *  The examples were there to show what the page does; an account brings the user's own.
 *  Anything the user changed is no longer example data and is not touched (`ExampleData.ts`).
 *
 *  A profile left empty by this keeps its example flag, which makes it a placeholder at first
 *  contact (`SyncCoordinator.emptyPlaceholdersToReplace`): dropped when the account has profiles
 *  of its own, kept - and so synchronised as the account's first profile - when it has none.
 *  It is never removed here, because a browser always needs one profile to show.
 *
 *  @param appState the profile data
 *  @param profiles the profile registry
 */
export async function removeUntouchedExamples(
    appState: Pick<AppStateRepository, "getActiveProfileId" | "readProfileData" | "saveProfileData" | "switchProfile" | "state$">,
    profiles: Pick<ProfileRepository, "getProfiles">
): Promise<void> {
    const activeId = appState.getActiveProfileId();
    let activeChanged = false;

    for (const profile of profiles.getProfiles()) {
        const data = profile.id === activeId ? activeData(appState) : await appState.readProfileData(profile.id);
        if (!data) {
            continue;
        }
        const { data: remaining, removed } = withoutExampleWorkspaces(data);
        if (removed === 0) {
            continue;
        }
        LOG.log("removeUntouchedExamples", `Removing ${removed} example workspace(s) from ${profile.name}`);
        await appState.saveProfileData(profile.id, remaining);
        activeChanged = activeChanged || profile.id === activeId;
    }
    if (activeChanged) {
        await appState.switchProfile(activeId);
    }
}

function activeData(appState: Pick<AppStateRepository, "state$">): ProfileData {
    const { environments, groups, subgroups, links, activeEnvironmentId } = appState.state$.get();
    return { environments, groups, subgroups, links, activeEnvironmentId };
}
