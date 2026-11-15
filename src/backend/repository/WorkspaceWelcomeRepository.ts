import { ChromeStorageWrapper } from "../datasource/chromeStorage/chromeStorageWrapper";
import { WORKSPACE_WELCOME_OFFERED_KEY } from "../datasource/chromeStorage/storageKeys";

/**
 *  How many identifiers are kept. The oldest are dropped past it. A workspace that gets its
 *  welcome again after hundreds of others is harmless, and the list cannot grow for ever.
 */
export const MAX_WELCOMED_WORKSPACES = 500;

/**
 *  Which workspaces this browser has already offered its welcome dialog for (#182).
 *
 *  The dialog opens the first time an empty workspace is shown, and only that once. Cancel
 *  counts too, because the user saw it. Per device, like the group sizes: the list holds
 *  identifiers only, and nothing about it is the account's business.
 */
export class WorkspaceWelcomeRepository {

    private datasource = new ChromeStorageWrapper();
    private offered: string[] = [];

    public async init(): Promise<void> {
        const stored = await this.datasource.get<unknown>(WORKSPACE_WELCOME_OFFERED_KEY);
        this.offered = Array.isArray(stored)
            ? stored.filter((id): id is string => typeof id === "string")
            : [];
    }

    /** Whether the welcome for this workspace was already shown on this browser. */
    public wasOffered(workspaceId: string): boolean {
        return this.offered.includes(workspaceId);
    }

    /**
     *  Records that the welcome for this workspace has been shown.
     *
     *  Storage is read again first, so that another open page's record is kept, not
     *  written over.
     */
    public async markOffered(workspaceId: string): Promise<void> {
        await this.init();
        if (this.offered.includes(workspaceId)) return;
        this.offered = [...this.offered, workspaceId].slice(-MAX_WELCOMED_WORKSPACES);
        await this.datasource.save(WORKSPACE_WELCOME_OFFERED_KEY, this.offered);
    }
}

export const workspaceWelcomeRepository = new WorkspaceWelcomeRepository();
