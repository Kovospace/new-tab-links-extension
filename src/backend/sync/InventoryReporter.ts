import { ProfileData } from "../entity/AppStateEntity";
import { ChromeStorageWrapper } from "../datasource/chromeStorage/chromeStorageWrapper";
import { INVENTORY_REPORTED_KEY } from "../datasource/chromeStorage/storageKeys";
import { Logger } from "../../utils/logger";
import { BackendApiClient } from "./BackendApiClient";
import { DeviceInventoryDto, InventorySyncState } from "./SyncContracts";
import { AccountInventory, ItemSyncState, LocalProfile } from "./SyncSlots";

/** What synchronises on this device, as last decided, for the account signed in. */
export interface PublishedSyncScope {
    accountId: string;
    profiles: Record<string, ItemSyncState>;
    workspaces: Record<string, ItemSyncState>;
}

/** What was last reported, so an unchanged inventory is not sent again. */
interface ReportedInventory {
    accountId: string;
    signature: string;
}

/**
 *  Builds what this installation holds, as the account's device page shows it.
 *
 *  **Names and counts only.** Never a link, an address or a group's name: the server never sees
 *  local-only data otherwise, and this is all it needs to tell the user where they stand.
 *
 *  @param local   this device's profiles and their data
 *  @param scope   what synchronises and why not
 *  @param account the account's lists; what it holds is reported under its identifier
 */
export function buildInventory(
    local: LocalProfile[], scope: PublishedSyncScope, account: AccountInventory | null
): DeviceInventoryDto {
    const onAccount = new Set([
        ...(account?.profiles ?? []).map(profile => profile.id),
        ...(account?.workspaces ?? []).map(workspace => workspace.id)
    ]);
    const stateOf = (decided: ItemSyncState | undefined): InventorySyncState =>
        decided?.state ?? "LOCAL_ONLY_FREE_LIMIT";

    return {
        profiles: local.map(({ meta, data }) => ({
            accountId: onAccount.has(meta.id) ? meta.id : null,
            name: meta.name,
            syncState: stateOf(scope.profiles[meta.id]),
            workspaces: workspacesOf(data).map(workspace => ({
                accountId: onAccount.has(workspace.id) ? workspace.id : null,
                name: workspace.name,
                syncState: stateOf(scope.workspaces[workspace.id]),
                groupCount: Object.values(data!.groups).filter(group => group.environmentId === workspace.id).length,
                subgroupCount: Object.values(data!.subgroups).filter(subgroup => subgroup.environmentId === workspace.id).length,
                linkCount: Object.values(data!.links).filter(link => link.environmentId === workspace.id).length
            }))
        }))
    };
}

function workspacesOf(data: ProfileData | null) {
    return Object.values(data?.environments ?? {})
        .sort((one, other) => (one.order ?? 0) - (other.order ?? 0));
}

/**
 *  Reports this installation's inventory to the account after a synchronisation cycle,
 *  whenever it changed since the last report (`PUT /api/v1/users/me/devices/current/inventory`).
 *
 *  What was last reported is remembered in storage per account, so a new tab that changes
 *  nothing sends nothing. A report that fails is simply tried after the next cycle.
 */
export class InventoryReporter {

    private readonly LOG = new Logger("InventoryReporter");
    private readonly datasource = new ChromeStorageWrapper();

    constructor(private readonly apiClient: Pick<BackendApiClient, "reportInventory">) {
    }

    /**
     *  @param accountId whose inventory it is
     *  @param local     this device's profiles and their data
     *  @param scope     what synchronises and why not
     *  @param account   the account's lists, for identifiers
     */
    public async report(
        accountId: string, local: LocalProfile[], scope: PublishedSyncScope, account: AccountInventory | null
    ): Promise<void> {
        if (typeof this.apiClient.reportInventory !== "function") {
            return;
        }
        const inventory = buildInventory(local, scope, account);
        const signature = JSON.stringify(inventory);
        const last = await this.datasource.get<ReportedInventory>(INVENTORY_REPORTED_KEY);
        if (last?.accountId === accountId && last.signature === signature) {
            return;
        }
        const result = await this.apiClient.reportInventory(inventory);
        if (result.outcome !== "success") {
            this.LOG.debug("report", `Not reported: ${result.outcome}`);
            return;
        }
        await this.datasource.save<ReportedInventory>(INVENTORY_REPORTED_KEY, { accountId, signature });
    }
}
