import { SyncOperation, SyncSnapshot } from "../../src/backend/sync/SyncContracts";

/**
 *  An account that applies what it is pushed and serves it back.
 *
 *  Enough of the backend to answer one question, which is the question this extension's whole
 *  synchronisation rests on: **after a device has pushed and pulled, does it still think it has
 *  something to say?** If it does, it will say it again on the next trigger, and again, and
 *  every attempt draws a change notification that sets every other connected device doing the
 *  same. That is not a slow leak; it is a loop that runs at network speed.
 *
 *  The rules here are the ones the real backend documents: an upsert replaces every
 *  synchronised field of the record it names, a delete removes it, and a record absent from a
 *  push is left alone. Anything this fake gets wrong is a test that lies, so it stays small and
 *  says what it does not do: no validation, no cascades, no identifier remapping.
 */
export class FakeAccount {

    private readonly profiles = new Map<string, Record<string, unknown>>();
    private readonly environments = new Map<string, Record<string, unknown>>();
    private readonly groups = new Map<string, Record<string, unknown>>();
    private readonly subgroups = new Map<string, Record<string, unknown>>();
    private readonly links = new Map<string, Record<string, unknown>>();
    private readonly closedTabs = new Map<string, Record<string, unknown>>();

    private readonly at = "2026-01-01T00:00:00Z";

    /** Applies a pushed batch, in the order it was sent. */
    public apply(operations: SyncOperation[]): void {
        for (const operation of operations) {
            const store = this.storeFor(operation.type);
            if (operation.op === "delete") {
                store.delete(operation.id);
                continue;
            }
            store.set(operation.id, this.record(operation));
        }
    }

    /** Everything the account holds, in the shape the extension pulls. */
    public snapshot(): SyncSnapshot {
        return {
            owner: { id: "owner", username: "kovo" },
            profiles: this.ordered(this.profiles) as unknown as SyncSnapshot["profiles"],
            environments: this.ordered(this.environments) as unknown as SyncSnapshot["environments"],
            groups: this.ordered(this.groups) as unknown as SyncSnapshot["groups"],
            subgroups: this.ordered(this.subgroups) as unknown as SyncSnapshot["subgroups"],
            links: this.ordered(this.links) as unknown as SyncSnapshot["links"],
            closedTabs: [...this.closedTabs.values()] as unknown as SyncSnapshot["closedTabs"],
            capturedAt: this.at
        };
    }

    private storeFor(kind: SyncOperation["type"]): Map<string, Record<string, unknown>> {
        switch (kind) {
            case "profile": return this.profiles;
            case "environment": return this.environments;
            case "group": return this.groups;
            case "subgroup": return this.subgroups;
            case "link": return this.links;
            case "closedTab": return this.closedTabs;
        }
    }

    /**
     *  One stored row, built from the operation the way the backend's DTOs are.
     *
     *  Every field the snapshot carries is written from the operation, and nothing else is
     *  kept: an upsert replaces the record. The names differ from the operation's in the
     *  places the real contract differs - `name` becomes `name` for a profile and `title` for
     *  a link, a subgroup's parent is `parentGroupId` - which is exactly where a mistake in
     *  the extension's own mapping would hide.
     */
    private record(operation: SyncOperation): Record<string, unknown> {
        const common = { id: operation.id, createdAt: this.at, updatedAt: this.at };

        switch (operation.type) {
            case "profile":
                return {
                    ...common, ownerId: "owner",
                    name: operation.name,
                    position: operation.position ?? 0,
                    enableDragAndDrop: operation.enableDragAndDrop ?? false,
                    hideTips: operation.hideTips ?? false
                };
            case "environment":
                return {
                    ...common, ownerId: "owner",
                    profileId: operation.profileId,
                    name: operation.name,
                    description: operation.description ?? null,
                    position: operation.position ?? 0
                };
            case "group":
                return {
                    ...common,
                    environmentId: operation.environmentId,
                    name: operation.name,
                    description: operation.description ?? null,
                    position: operation.position ?? 0
                };
            case "subgroup":
                return {
                    ...common,
                    parentGroupId: operation.parentGroupId,
                    name: operation.name,
                    description: operation.description ?? null,
                    position: operation.position ?? 0,
                    collapsed: operation.collapsed ?? false,
                    defaultCollapsed: operation.defaultCollapsed ?? false,
                    catchLinksIntoTabGroup: operation.catchLinksIntoTabGroup ?? false,
                    color: operation.color ?? null
                };
            case "link":
                return {
                    ...common,
                    parentGroupId: operation.parentGroupId,
                    parentSubgroupId: operation.parentSubgroupId ?? null,
                    title: operation.title,
                    url: operation.url,
                    faviconUrl: operation.faviconUrl ?? null,
                    position: operation.position ?? 0
                };
            case "closedTab":
                return {
                    ...common,
                    profileId: operation.profileId,
                    url: operation.url,
                    title: operation.title ?? "",
                    faviconUrl: operation.faviconUrl ?? null,
                    closedAt: operation.closedAt,
                    deviceName: operation.deviceName ?? null
                };
        }
    }

    private ordered(store: Map<string, Record<string, unknown>>): Record<string, unknown>[] {
        return [...store.values()].sort(
            (one, other) => Number(one.position ?? 0) - Number(other.position ?? 0));
    }
}
