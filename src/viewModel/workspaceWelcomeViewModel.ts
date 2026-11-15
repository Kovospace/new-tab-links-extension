import { AppStateRepository } from "../backend/repository/AppStateRepository";
import { WorkspaceWelcomeRepository } from "../backend/repository/WorkspaceWelcomeRepository";
import { ImportedGroup } from "../backend/entity/ImportedGroups";
import { LimitRefusal } from "../backend/entity/PlanLimits";
import { t } from "../i18n/i18n";
import {
    BookmarkFolderChoice, BookmarkNode, bookmarkFolderChoices, groupsToImport
} from "./bookmarkImport";

/** A way forward the welcome widget offers. */
export type WelcomeAction = "addGroup" | "importBookmarks" | "signIn" | "cancel";

/**
 *  The widget an empty workspace shows where its columns would be (#182).
 *
 *  It replaced the first-run screen. The page no longer asks for a first workspace: it makes
 *  one (`AppStateRepository.addStarterWorkspace`) and opens it. The widget then offers to fill
 *  it - a group, or the browser's bookmarks - and, to somebody not signed in, to log in or
 *  set up synchronisation. Cancel puts it away for that workspace on this browser
 *  (`WorkspaceWelcomeRepository`). A workspace that has a group never shows it.
 */
export class WorkspaceWelcomeViewModel {

    constructor(
        private readonly appState: AppStateRepository,
        private readonly welcomes: WorkspaceWelcomeRepository
    ) {}

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
 */
export function welcomeActions(signedIn: boolean): WelcomeAction[] {
    return signedIn
        ? ["addGroup", "importBookmarks", "cancel"]
        : ["addGroup", "importBookmarks", "signIn", "cancel"];
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
