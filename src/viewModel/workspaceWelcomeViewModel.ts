import { AppStateRepository } from "../backend/repository/AppStateRepository";
import { ProfileDataTransfer } from "../backend/repository/ProfileDataTransfer";
import { ProfileRepository, profileRepository } from "../backend/repository/ProfileRepository";
import { buildExampleProfileData } from "../backend/datasource/init/AppStateInit";
import { isStarterWorkspace, markedAsExample } from "../backend/entity/ExampleData";
import { refusedUnderFairUse } from "./fairUseNoticeViewModel";
import { WorkspaceWelcomeRepository } from "../backend/repository/WorkspaceWelcomeRepository";
import { ImportedGroup } from "../backend/entity/ImportedGroups";
import { LimitRefusal } from "../backend/entity/PlanLimits";
import { t } from "../i18n/i18n";
import {
    BookmarkFolderChoice, BookmarkNode, bookmarkFolderChoices, groupsToImport
} from "./bookmarkImport";

/** A way forward the welcome widget offers. */
export type WelcomeAction = "addGroup" | "importBookmarks" | "signIn" | "importBackup" | "loadExamples" | "cancel";

/**
 *  The widget an empty workspace shows where its columns would be (#182).
 *
 *  It replaced the first-run screen. The page no longer asks for a first workspace: it makes
 *  one (`AppStateRepository.addStarterWorkspace`) and opens it. The widget then offers to fill
 *  it - a group, or the browser's bookmarks - and, to somebody not signed in, to log in or
 *  set up synchronisation. Cancel puts it away for that workspace on this browser
 *  (`WorkspaceWelcomeRepository`). A workspace that has a group never shows it.
 *
 *  On the first run - the open workspace is still the untouched starter a fresh install made -
 *  it is headed "Welcome to Tabilinks!" and offers two more ways in: links from a backup file,
 *  and the example set. Both replace the profile's data, which then holds nothing but that
 *  empty starter, so nothing is lost. Anywhere else they would overwrite the user's own links.
 */
export class WorkspaceWelcomeViewModel {

    constructor(
        private readonly appState: AppStateRepository,
        private readonly welcomes: WorkspaceWelcomeRepository,
        private readonly profiles: Pick<ProfileRepository, "markExample"> = profileRepository
    ) {}

    /** Whether this is the first run: the workspace is the starter, never touched. */
    public isFirstRun(workspaceId: string): boolean {
        return isStarterWorkspace(this.appState.state$.get(), workspaceId);
    }

    /**
     *  Replaces the profile with a backup file's - only ever offered on the first run, where
     *  the profile holds nothing but the starter. Resolves to whether one was taken.
     */
    public async importBackup(): Promise<boolean> {
        const data = await ProfileDataTransfer.importFromFile();
        if (!data || refusedUnderFairUse(data)) return false;
        await this.appState.replaceCurrentProfileData(data);
        return true;
    }

    /**
     *  Replaces the starter with the example set, flagged as example data as the first-run
     *  screen used to flag it: never synchronised, and removed at sign-in while untouched.
     */
    public async loadExamples(): Promise<void> {
        await this.appState.replaceCurrentProfileData(markedAsExample(buildExampleProfileData()));
        await this.profiles.markExample(this.appState.getActiveProfileId());
    }

    /** Whether to show the widget: the workspace is empty and its widget was not cancelled here. */
    public isDue(workspaceId: string): boolean {
        return this.appState.getGroups(workspaceId).length === 0
            && !this.welcomes.wasDismissed(workspaceId);
    }

    /** Cancel: the widget is not shown for this workspace again on this browser. */
    public dismiss(workspaceId: string): Promise<void> {
        return this.welcomes.markDismissed(workspaceId);
    }

    /** The bookmark folders to offer, out of the browser's tree. */
    public bookmarkChoices(tree: ReadonlyArray<BookmarkNode>): BookmarkFolderChoice[] {
        return bookmarkFolderChoices(tree, t("workspace.bookmarkImport.untitled"));
    }

    /** What the ticked folders would make. */
    public bookmarkGroups(tree: ReadonlyArray<BookmarkNode>, chosen: ReadonlySet<string>): ImportedGroup[] {
        return groupsToImport(tree, chosen, t("workspace.bookmarkImport.untitled"));
    }

    /** Why these groups would not fit the workspace, worded for the user, or null when they would. */
    public importProblem(workspaceId: string, groups: ReadonlyArray<ImportedGroup>): string | null {
        const refusal = this.appState.refusalOfImport(workspaceId, groups);
        return refusal ? importRefusalText(refusal) : null;
    }

    /** Makes the groups. Resolves to false when a limit refused them. */
    public importGroups(workspaceId: string, groups: ReadonlyArray<ImportedGroup>): Promise<boolean> {
        return this.appState.importGroups(workspaceId, groups);
    }
}

/**
 *  Which ways forward the widget offers, in order. Cancel is always last.
 *
 *  @param signedIn whether this browser is signed in to an account
 *  @param firstRun whether the workspace is the untouched starter (`isFirstRun`), which adds the
 *                  backup file and the examples after signing in
 */
export function welcomeActions(signedIn: boolean, firstRun: boolean = false): WelcomeAction[] {
    return [
        "addGroup",
        "importBookmarks",
        ...(signedIn ? [] : ["signIn" as const]),
        ...(firstRun ? ["importBackup" as const, "loadExamples" as const] : []),
        "cancel"
    ];
}

/** Says which limit an import would break, with the number. */
function importRefusalText(refusal: LimitRefusal): string {
    const max = refusal.maximum;
    switch (refusal.limit) {
        case "GROUPS_PER_WORKSPACE":
            return t("workspace.bookmarkImport.tooManyGroups", { max });
        case "SUBGROUPS_PER_GROUP":
            return t("workspace.bookmarkImport.tooManySubgroups", { max });
        default:
            return t("workspace.bookmarkImport.tooManyLinks", { max });
    }
}
