import { BookmarkRequest } from "../../../utils/bookmarkRequest";
import { PROFILE_REGISTRY_KEY, appStateKey } from "../../datasource/chromeStorage/storageKeys";
import { ChromeStorageWrapper } from "../../datasource/chromeStorage/chromeStorageWrapper";
import type { AppState } from "../../entity/AppStateEntity";
import type { ProfileRegistry } from "../../repository/ProfileRepository";
import { AppStateRepository } from "../../repository/AppStateRepository";
import { appStateInit } from "../../datasource/init/AppStateInit";
import { BookmarkViewModel } from "../../../viewModel/bookmarkViewModel";
import { isFreePlanRefusal, LimitRefusal } from "../../entity/PlanLimits";
import { CATALOGUES } from "../../../i18n/catalogue";
import { t } from "../../../i18n/i18n";
import { flashSaveGroupId, openWorkspaceId } from "./bookmarkMenuTree";

/**
 *  Flash save (#204): the page or the link kept at once, with no question asked, in a group
 *  called "Flash save" in the open workspace - made there the first time it is needed. For
 *  capturing links at speed and sorting them later.
 *
 *  From the right-click menu (the first entry under "Tabilinks") and from its keyboard shortcut
 *  (`flash-save`, suggested Alt+Shift+F), which needs no menu at all.
 */

/** How a flash save ended. */
export type FlashSaveOutcome =
    | { kind: "saved" }
    /** No profile or no workspace to save into: the form, which can make one, has to ask. */
    | { kind: "nowhere" }
    /** A limit refused it - the group could not be made, or the workspace holds no more links. */
    | { kind: "refused"; title: string; message: string };

const storage = new ChromeStorageWrapper();

/** What the group is called, in every language the extension speaks. */
function flashSaveNames(): string[] {
    return Object.values(CATALOGUES)
        .map(catalogue => (catalogue.bookmark as { flashSave?: { groupName?: string } })?.flashSave?.groupName)
        .filter((name): name is string => typeof name === "string");
}

/**
 *  Keeps the page or the link in the open workspace's "Flash save" group, making the group
 *  first when there is none. Through the same repository and checks the popup uses - positions,
 *  the workspace a link names, the limits - loaded from storage at this moment, because the
 *  worker holds nothing between events.
 */
export async function flashSave(request: BookmarkRequest): Promise<FlashSaveOutcome> {
    const registry = await storage.get<ProfileRegistry>(PROFILE_REGISTRY_KEY);
    const profileId = registry?.activeProfileId;
    if (!profileId || !await storage.get<AppState>(appStateKey(profileId))) {
        return { kind: "nowhere" };
    }

    const appState = new AppStateRepository();
    await appState.init(appStateInit, profileId);
    const state = appState.state$.get();
    const workspaceId = openWorkspaceId(state);
    if (!workspaceId) {
        return { kind: "nowhere" };
    }

    const groupName = t("bookmark.flashSave.groupName");
    const groupId = flashSaveGroupId(state, flashSaveNames());
    const refusal = await new BookmarkViewModel(appState).saveInto(
        request.url,
        request.title.trim() || request.url,
        { workspace: { id: workspaceId }, group: groupId ? { id: groupId } : { create: groupName } });

    return refusal
        ? { kind: "refused", title: t("bookmark.flashSave.refusedTitle"),
            message: refusalMessage(refusal, groupName, state.environments[workspaceId]?.name ?? "") }
        : { kind: "saved" };
}

/** Says why, naming the group and the workspace when it was the group that could not be made. */
function refusalMessage(refusal: LimitRefusal, group: string, workspace: string): string {
    if (refusal.limit === "GROUPS_PER_WORKSPACE") {
        return t("bookmark.flashSave.noRoomForGroup", { group, workspace, maximum: refusal.maximum });
    }
    return isFreePlanRefusal(refusal)
        ? t(`fairUse.freePlan.limits.${refusal.limit}`, { maximum: refusal.maximum })
        : t(`fairUse.limits.${refusal.limit}`, { maximum: refusal.maximum });
}
