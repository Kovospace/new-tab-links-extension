import { AppStateRepository } from "../backend/repository/AppStateRepository";
import { ProfileDataTransfer } from "../backend/repository/ProfileDataTransfer";
import { WorkspaceWelcomeRepository } from "../backend/repository/WorkspaceWelcomeRepository";
import { refusedUnderFairUse } from "./fairUseNoticeViewModel";
import { t } from "../i18n/i18n";

/**
 *  The page shown when the user has deleted every workspace of the open profile (#182).
 *
 *  A profile with no workspace for any other reason - a fresh install, a new profile - is
 *  given a starter workspace and never comes here. Deleting the last one is a deliberate act,
 *  though, and a new "My workspace" appearing in its place would undo it. So the page asks
 *  instead: make a workspace, bring links in from a backup file, or log in / set up
 *  synchronisation. Cancel means "not now", and gets the starter after all.
 *
 *  Each action ends in a reload, because the workspace page is drawn from scratch around a
 *  workspace.
 */
export class WorkspaceLessViewModel {

    constructor(
        private readonly appState: AppStateRepository,
        private readonly welcomes: WorkspaceWelcomeRepository
    ) {}

    /** A workspace under this name. Resolves to whether one was made - a limit may refuse it. */
    public async createWorkspace(name: string, description?: string): Promise<boolean> {
        await this.appState.addWorkspace(name, description);
        return this.settled();
    }

    /** Replaces the profile with a backup file's. Resolves to whether one was taken. */
    public async importBackup(): Promise<boolean> {
        const data = await ProfileDataTransfer.importFromFile();
        if (!data || refusedUnderFairUse(data)) return false;
        await this.appState.replaceCurrentProfileData(data);
        return this.settled();
    }

    /** Cancel: the starter workspace a fresh profile gets. */
    public async makeStarter(): Promise<boolean> {
        await this.appState.addStarterWorkspace(t("workspace.starterName"));
        return this.settled();
    }

    /** Whether the profile has a workspace now. When it has, it no longer counts as emptied by the user. */
    private async settled(): Promise<boolean> {
        if (Object.keys(this.appState.state$.get().environments).length === 0) return false;
        await this.welcomes.clearEmptiedByUser(this.appState.getActiveProfileId());
        return true;
    }
}
