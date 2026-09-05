import { ChromeStorageWrapper } from "../datasource/chromeStorage/chromeStorageWrapper";
import { SyncBaseline } from "./ChangeSetBuilder";
import { Logger } from "../../utils/logger";

const BASELINE_KEY = "sync_baseline";

/** The baseline, together with whose account it describes. */
interface StoredBaseline extends SyncBaseline {
    accountUserId: string;
}

/**
 *  Remembers what the account is believed to hold, so the next push can send only what
 *  changed since.
 *
 *  It is written only after the server has confirmed something - a successful push, or a
 *  snapshot just applied. That is what makes an interrupted push harmless: the baseline still
 *  describes the last state the server actually acknowledged, so the next attempt computes
 *  the same work again rather than assuming it was done.
 *
 *  The account is recorded alongside it because a baseline is meaningless against a different
 *  account. Signing in as somebody else must not be able to diff one person's links against
 *  another's and conclude that everything was deleted.
 */
export class SyncBaselineRepository {

    private LOG: Logger = new Logger("SyncBaselineRepository");
    private datasource = new ChromeStorageWrapper();
    private stored: StoredBaseline | null = null;

    /** Loads the persisted baseline, if there is one. */
    public async init(): Promise<void> {
        this.stored = await this.datasource.get<StoredBaseline>(BASELINE_KEY);
        this.LOG.debug("init", this.stored ? "Baseline restored" : "No baseline yet");
    }

    /**
     *  The baseline for one account, or null when this device has never synchronised it.
     *
     *  A null answer is what tells the coordinator that this is a first connection, and that
     *  the account's data has to be merged with what is already here rather than replacing it.
     */
    public getFor(accountUserId: string): SyncBaseline | null {
        if (!this.stored || this.stored.accountUserId !== accountUserId) {
            return null;
        }
        return { profiles: this.stored.profiles, dataByProfileId: this.stored.dataByProfileId };
    }

    /** Records what the account is now known to hold. */
    public async store(accountUserId: string, baseline: SyncBaseline): Promise<void> {
        this.stored = { accountUserId, ...baseline };
        await this.datasource.save(BASELINE_KEY, this.stored);
    }

    /** Forgets the baseline, on sign-out. The user's own data is not touched. */
    public async clear(): Promise<void> {
        this.stored = null;
        await this.datasource.save(BASELINE_KEY, null);
    }
}

export const syncBaselineRepository = new SyncBaselineRepository();
