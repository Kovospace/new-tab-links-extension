import { ChromeStorageWrapper } from "../datasource/chromeStorage/chromeStorageWrapper";
import { PROFILES_EMPTIED_KEY, WORKSPACE_WELCOME_DISMISSED_KEY } from "../datasource/chromeStorage/storageKeys";

/**
 *  How many identifiers each list keeps. The oldest are dropped past it. A widget that comes
 *  back after hundreds of others is harmless, and the list cannot grow for ever.
 */
export const MAX_REMEMBERED_IDS = 500;

/**
 *  What this browser remembers about empty workspaces and empty profiles (#182). Per device,
 *  like the group sizes: identifiers only, and nothing the account needs to know.
 *
 *  - **Dismissed widgets.** An empty workspace shows its welcome widget until somebody fills
 *    it or presses Cancel. Cancel is remembered here, per workspace.
 *  - **Profiles the user emptied.** A profile with no workspace is normally given a starter
 *    one. When the user deleted the last workspace themselves, it opens on the page with no
 *    workspace instead, which offers to make one or bring one in. The mark is cleared as soon
 *    as the profile has a workspace again.
 */
export class WorkspaceWelcomeRepository {

    private datasource = new ChromeStorageWrapper();
    private dismissed: string[] = [];
    private emptied: string[] = [];

    public async init(): Promise<void> {
        this.dismissed = await this.read(WORKSPACE_WELCOME_DISMISSED_KEY);
        this.emptied = await this.read(PROFILES_EMPTIED_KEY);
    }

    /** Whether the welcome widget of this workspace was cancelled on this browser. */
    public wasDismissed(workspaceId: string): boolean {
        return this.dismissed.includes(workspaceId);
    }

    /** Remembers that the widget was cancelled. Storage is read first, so another page's record survives. */
    public async markDismissed(workspaceId: string): Promise<void> {
        this.dismissed = await this.added(WORKSPACE_WELCOME_DISMISSED_KEY, workspaceId);
    }

    /** Whether the user deleted this profile's last workspace and none was made since. */
    public wasEmptiedByUser(profileId: string): boolean {
        return this.emptied.includes(profileId);
    }

    public async markEmptiedByUser(profileId: string): Promise<void> {
        this.emptied = await this.added(PROFILES_EMPTIED_KEY, profileId);
    }

    /** The profile has a workspace again. */
    public async clearEmptiedByUser(profileId: string): Promise<void> {
        const stored = await this.read(PROFILES_EMPTIED_KEY);
        if (!stored.includes(profileId)) return;
        this.emptied = stored.filter(id => id !== profileId);
        await this.datasource.save(PROFILES_EMPTIED_KEY, this.emptied);
    }

    private async read(key: string): Promise<string[]> {
        const stored = await this.datasource.get<unknown>(key);
        return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === "string") : [];
    }

    private async added(key: string, id: string): Promise<string[]> {
        const stored = await this.read(key);
        if (stored.includes(id)) return stored;
        const updated = [...stored, id].slice(-MAX_REMEMBERED_IDS);
        await this.datasource.save(key, updated);
        return updated;
    }
}

export const workspaceWelcomeRepository = new WorkspaceWelcomeRepository();
