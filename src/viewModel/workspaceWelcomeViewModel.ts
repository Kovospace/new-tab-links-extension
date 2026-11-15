import { AppStateRepository } from "../backend/repository/AppStateRepository";
import { WorkspaceWelcomeRepository } from "../backend/repository/WorkspaceWelcomeRepository";
import { buildExampleProfileData } from "../backend/datasource/init/AppStateInit";
import { markedAsExample } from "../backend/entity/ExampleData";
import { profileRepository } from "../backend/repository/ProfileRepository";
import { ImportedGroup } from "../backend/entity/ImportedGroups";
import { LimitRefusal } from "../backend/entity/PlanLimits";
import { t } from "../i18n/i18n";
import {
    BookmarkFolderChoice, BookmarkNode, bookmarkFolderChoices, groupsToImport
} from "./bookmarkImport";

/** A way forward the welcome dialog offers. */
export type WelcomeAction =
    "addGroup" | "rename" | "importBookmarks" | "loadExamples" | "logIn" | "syncCode" | "cancel";

/** What the welcome dialog says and offers, for one workspace. */
export interface WelcomeDTO {
    title: string;
    message: string;
    actions: WelcomeAction[];
}

/** What decides the offer, apart from the workspace itself. */
export interface WelcomeContext {
    signedIn: boolean;
    /** Already renamed from this dialog: offered no second time. */
    renamed?: boolean;
}

/**
 *  The dialog an empty workspace opens with, once per workspace on each browser (#182).
 *
 *  It replaced the first-run screen. The page no longer asks for a first workspace: it makes
 *  one (`AppStateRepository.addStarterWorkspace`) and opens it, and this offers the ways to
 *  fill it:
 *  - a group, while the workspace has none;
 *  - a new name;
 *  - the browser's bookmarks;
 *  - the examples, while this empty workspace is all the profile holds, since they replace
 *    the whole profile;
 *  - signing in, for somebody not signed in whose links are already in an account.
 *  Cancel leaves it empty. It is not offered again for that workspace, whatever the answer was.
 */
export class WorkspaceWelcomeViewModel {

    constructor(
        private readonly appState: AppStateRepository,
        private readonly welcomes: WorkspaceWelcomeRepository
    ) {}

    /** Whether to open the welcome now: the workspace is empty and has never had one here. */
    public isDue(workspaceId: string): boolean {
        return this.appState.getGroups(workspaceId).length === 0
            && !this.welcomes.wasOffered(workspaceId);
    }

    /** Records that it was opened, so it is not again. */
    public markOffered(workspaceId: string): Promise<void> {
        return this.welcomes.markOffered(workspaceId);
    }

    /** What the dialog says and offers for this workspace. */
    public welcomeFor(workspaceId: string, context: WelcomeContext): WelcomeDTO {
        const state = this.appState.state$.get();
        // Nothing in the profile but this empty workspace: a first start, renamed or not. The
        // examples may be offered, since they would replace nothing of the user's.
        const starter = Object.keys(state.environments).length === 1
            && Object.keys(state.groups).length === 0;
        return {
            title: starter
                ? t("workspace.welcome.firstTitle")
                : t("workspace.welcome.title"),
            message: starter
                ? t("workspace.welcome.firstMessage")
                : t("workspace.welcome.message", { name: state.environments[workspaceId]?.name ?? "" }),
            actions: welcomeActions({
                hasGroups: this.appState.getGroups(workspaceId).length > 0,
                starter,
                ...context
            })
        };
    }

    /** The current name and description, to start the rename from. */
    public workspaceText(workspaceId: string): { name: string; description: string } {
        const workspace = this.appState.state$.get().environments[workspaceId];
        return { name: workspace?.name ?? "", description: workspace?.description ?? "" };
    }

    /** Puts the example set in place of the starter. It is flagged as examples (`ExampleData.ts`). */
    public async loadExamples(): Promise<void> {
        await this.appState.replaceCurrentProfileData(markedAsExample(buildExampleProfileData()));
        await profileRepository.markExample(this.appState.getActiveProfileId());
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
 *  Which ways forward to offer, in the order they are offered. Cancel is always last.
 *
 *  @param situation the workspace, and who is looking at it
 */
export function welcomeActions(situation: WelcomeContext & { hasGroups: boolean; starter: boolean }): WelcomeAction[] {
    const actions: WelcomeAction[] = [];
    if (!situation.hasGroups) actions.push("addGroup");
    actions.push("importBookmarks");
    if (!situation.renamed) actions.push("rename");
    if (situation.starter) actions.push("loadExamples");
    if (!situation.signedIn && !situation.hasGroups) actions.push("logIn", "syncCode");
    actions.push("cancel");
    return actions;
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
