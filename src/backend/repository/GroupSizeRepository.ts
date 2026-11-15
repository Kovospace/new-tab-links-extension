import { ChromeStorageWrapper } from "../datasource/chromeStorage/chromeStorageWrapper";
import { GROUP_SIZES_KEY } from "../datasource/chromeStorage/storageKeys";
import { Logger } from "../../utils/logger";

/** A group's size as set by hand, in em - so the size slider still scales it. */
export interface GroupSize {
    width: number;
    height: number;
}

/** The smallest a group may be dragged to, in em: room for a favicon and a few letters. */
export const MIN_GROUP_WIDTH = 8;
export const MIN_GROUP_HEIGHT = 5;

/** A stored size as one this version can draw, or nothing for anything it cannot. */
export function normalizeGroupSize(value: unknown): GroupSize | null {
    if (!value || typeof value !== "object") return null;
    const { width, height } = value as Partial<GroupSize>;
    if (typeof width !== "number" || !Number.isFinite(width)
        || typeof height !== "number" || !Number.isFinite(height)) {
        return null;
    }
    return {
        width: Math.max(MIN_GROUP_WIDTH, Math.round(width * 100) / 100),
        height: Math.max(MIN_GROUP_HEIGHT, Math.round(height * 100) / 100)
    };
}

/**
 *  The groups resized by hand on this browser (#173), and how big.
 *
 *  **Per device, like the size slider**: a width chosen on a wide desktop would squeeze a
 *  laptop, so nothing here is synchronised and a group nobody has resized here keeps its
 *  automatic width. Read once before the page draws, so a resized group never jumps.
 *
 *  No subscription: the group reads its size as it is drawn, and a resize is applied by the
 *  group itself while it is dragged. Another open page sees it the next time it draws. Every
 *  write re-reads what is stored first, so a page holding an older copy does not put back the
 *  sizes another page has changed since.
 */
export class GroupSizeRepository {

    private LOG: Logger = new Logger("GroupSizeRepository");
    private datasource = new ChromeStorageWrapper();
    private sizes: Record<string, GroupSize> = {};

    public async init(): Promise<void> {
        const stored = await this.datasource.get<Record<string, unknown>>(GROUP_SIZES_KEY);
        this.sizes = {};
        Object.entries(stored ?? {}).forEach(([groupId, value]) => {
            const size = normalizeGroupSize(value);
            if (size) this.sizes[groupId] = size;
        });
    }

    /** The size a group was given by hand here, or null when it follows the automatic width. */
    public get(groupId: string): GroupSize | null {
        return this.sizes[groupId] ?? null;
    }

    public async set(groupId: string, size: GroupSize): Promise<void> {
        const normalized = normalizeGroupSize(size);
        if (!normalized) return;
        await this.init();
        this.sizes = { ...this.sizes, [groupId]: normalized };
        await this.save();
    }

    /** Forgets a group's size: it follows the automatic width again. Also for a deleted group. */
    public async forget(groupId: string): Promise<void> {
        await this.init();
        if (!(groupId in this.sizes)) return;
        const { [groupId]: _forgotten, ...rest } = this.sizes;
        this.sizes = rest;
        await this.save();
    }

    private async save(): Promise<void> {
        this.LOG.debug("save", Object.keys(this.sizes).length, "resized groups");
        await this.datasource.save(GROUP_SIZES_KEY, this.sizes);
    }
}

export const groupSizeRepository = new GroupSizeRepository();
