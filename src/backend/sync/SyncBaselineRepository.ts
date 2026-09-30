import { ChromeStorageWrapper } from "../datasource/chromeStorage/chromeStorageWrapper";
import { SyncBaseline } from "./ChangeSetBuilder";
import { Logger } from "../../utils/logger";

const BASELINE_KEY = "sync_baseline";

/** Every account's baseline this device holds, by the account's user id. */
type StoredBaselines = Record<string, SyncBaseline>;

/**
 *  The shape stored before baselines were kept per account: one baseline, naming its account.
 *  Read once, on the way to the current shape.
 */
interface SingleAccountBaseline extends SyncBaseline {
    accountUserId: string;
}

/**
 *  What each account is believed to hold, as of the last synchronisation this device had with it.
 *
 *  **One per account, kept across sign-out.** It used to be a single slot, cleared when the user
 *  signed out. Local data now belongs to an account and stays on the device after sign-out - so
 *  when that account signs in again, the difference between its baseline and its data is exactly
 *  what was done meanwhile, deletions included. Without the baseline the return would be a first
 *  contact, and first contact never pushes a deletion: a link removed while signed out would come
 *  back from the account.
 */
export class SyncBaselineRepository {

    private LOG: Logger = new Logger("SyncBaselineRepository");
    private datasource = new ChromeStorageWrapper();
    private stored: StoredBaselines = {};

    public async init(): Promise<void> {
        const saved = await this.datasource.get<StoredBaselines | SingleAccountBaseline>(BASELINE_KEY);
        this.stored = SyncBaselineRepository.inCurrentShape(saved);
        this.LOG.debug("init", `Baselines restored for ${Object.keys(this.stored).length} account(s)`);
    }

    public getFor(accountUserId: string): SyncBaseline | null {
        // Handed back whole, never field by field. This used to name two of the fields, and a
        // baseline that forgets part of what the account holds is a device that offers that part
        // again on every synchronisation, for ever. Closed tabs were added to the baseline and not
        // to that line, so every push carried the whole list, every push drew a change
        // notification, and a second connected browser answered each one with a push of its own.
        return this.stored[accountUserId] ?? null;
    }

    public async store(accountUserId: string, baseline: SyncBaseline): Promise<void> {
        this.stored = { ...this.stored, [accountUserId]: baseline };
        await this.datasource.save(BASELINE_KEY, this.stored);
    }

    /**
     *  Reads whatever was stored into one baseline per account.
     *
     *  @param saved the stored value: the current map, the older single baseline, or nothing
     */
    private static inCurrentShape(saved: StoredBaselines | SingleAccountBaseline | null): StoredBaselines {
        if (!saved) {
            return {};
        }
        if (typeof (saved as SingleAccountBaseline).accountUserId === "string") {
            const { accountUserId, ...baseline } = saved as SingleAccountBaseline;
            return { [accountUserId]: baseline };
        }
        return saved as StoredBaselines;
    }
}

export const syncBaselineRepository = new SyncBaselineRepository();
