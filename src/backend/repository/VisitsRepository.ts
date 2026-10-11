import deepEqual from "fast-deep-equal";

import { storableVisit, Visit } from "../entity/VisitEntity";
import { isStorableClosedTabUrl } from "../entity/ClosedTabEntity";
import { ChromeStorageWrapper } from "../datasource/chromeStorage/chromeStorageWrapper";
import { visitsKey } from "../datasource/chromeStorage/storageKeys";
import { normalizeUrl } from "../worker/module/linkTabGroupCatcher";
import { uid } from "./AppStateRepositoryUtils";
import { Logger } from "../../utils/logger";
import { ObservableValue } from "../../utils/observableValue";
import { readStoredPlanLimits } from "./PremiumStanding";

/**
 *  The browsing history of one profile.
 *
 *  Built like `ClosedTabsRepository`, for the same reason: the service worker writes it, the
 *  page reads and removes, and neither holds the other's state. The functions are free of any
 *  instance so the worker can use them; the class is the page's observable view.
 */

const LOG = new Logger("VisitsRepository");

const storage = new ChromeStorageWrapper();

/**
 *  A visit refreshed within this long, with nothing about it changed, is not written again.
 *  Loading one page reports its address, its status and its title separately, and a page that
 *  rewrites its own title ("(3) Inbox") would otherwise be a storage write every few seconds.
 */
const UNCHANGED_REFRESH = 60_000;

/**
 *  Writes are queued. A burst of navigations across several tabs reaches the worker at once,
 *  and two read-modify-writes of the same list interleaving would lose one of them.
 */
let queue: Promise<unknown> = Promise.resolve();

/**
 *  Records a visit: today's entry for that address moves to the new time, or a new one is made.
 *
 *  **One entry per page per local day** - see `VisitEntity.ts`. The entry keeps its identifier
 *  when it moves, so the account is sent an update of one row rather than a row more.
 *
 *  **The cap is the plan's** (50 free, 1000 premium, or what the account last said), and the
 *  list rolls: a list already longer loses its oldest entry as each new one arrives.
 *
 *  @param profileId which profile's history to add to
 *  @param visit     the visit, without its identifier
 *  @param cap       how many to keep; the plan's, read from storage, when not given
 *  @return the entry as it was stored, or null when there was nothing to store
 */
export function recordVisit(
    profileId: string,
    visit: Omit<Visit, "id">,
    cap?: number
): Promise<Visit | null> {
    const recording = queue.then(() => record(profileId, visit, cap));
    queue = recording.catch(() => undefined);
    return recording;
}

async function record(
    profileId: string,
    visit: Omit<Visit, "id">,
    cap?: number
): Promise<Visit | null> {

    if (!profileId || !isStorableClosedTabUrl(visit.url)) {
        return null;
    }

    const stored = await readVisits(profileId);
    const sameDay = Object.values(stored)
        .find(existing => sameAddress(existing.url, visit.url)
            && sameLocalDay(existing.visitedAt, visit.visitedAt));

    const entry: Visit = storableVisit({
        ...visit,
        id: sameDay?.id ?? uid(),
        // A later report of the same page - its title arriving - must not empty what an
        // earlier one said.
        title: visit.title || sameDay?.title || "",
        faviconUrl: visit.faviconUrl ?? sameDay?.faviconUrl
    });

    if (sameDay && isMerelyRefreshed(sameDay, entry)) {
        return sameDay;
    }

    const others = Object.values(stored).filter(existing => existing.id !== entry.id);
    const plansCap = cap ?? (await readStoredPlanLimits()).browsingHistory;
    const pruned = [entry, ...others]
        .sort((one, other) => other.visitedAt - one.visitedAt)
        .slice(0, Math.max(plansCap, others.length));

    await writeVisits(profileId, byId(pruned));
    LOG.debug("recordVisit", `${entry.url} (${pruned.length} kept)`);
    return entry;
}

/** One profile's visits as stored, keyed by identifier. */
export async function readVisits(profileId: string): Promise<Record<string, Visit>> {
    return await storage.get<Record<string, Visit>>(visitsKey(profileId)) ?? {};
}

/** Replaces one profile's visits wholesale; used by the page and by a pull. */
export async function writeVisits(profileId: string, visits: Record<string, Visit>): Promise<void> {
    await storage.save(visitsKey(profileId), visits);
}

/** The entries newest first, which is the only order this list is ever read in. */
export function newestVisitsFirst(visits: Record<string, Visit>): Visit[] {
    return Object.values(visits).sort((one, other) => other.visitedAt - one.visitedAt);
}

/** Whether two moments fall on the same calendar day in this device's time zone. */
export function sameLocalDay(first: number, second: number): boolean {
    const one = new Date(first);
    const other = new Date(second);
    return one.getFullYear() === other.getFullYear()
        && one.getMonth() === other.getMonth()
        && one.getDate() === other.getDate();
}

function isMerelyRefreshed(stored: Visit, next: Visit): boolean {
    return stored.title === next.title
        && stored.faviconUrl === next.faviconUrl
        && stored.deviceName === next.deviceName
        && next.visitedAt - stored.visitedAt < UNCHANGED_REFRESH;
}

/** Whether two addresses are the same page, compared the way the tab catcher compares them. */
function sameAddress(one: string, other: string): boolean {
    const left = normalizeUrl(one);
    const right = normalizeUrl(other);
    return left !== null && left === right;
}

function byId(visits: Visit[]): Record<string, Visit> {
    return Object.fromEntries(visits.map(visit => [visit.id, visit]));
}

/**
 *  The page's view of one profile's browsing history. It follows storage rather than holding
 *  the truth, because the worker writes it.
 */
export class VisitsRepository {

    private profileId: string = "";

    /** Whether the storage listener is already on; init may be called again on a switch. */
    private watching: boolean = false;

    public readonly visits$ = new ObservableValue<Visit[]>([]);

    /**
     *  Loads a profile's history and starts following it. Can be called again for another
     *  profile, as `ClosedTabsRepository.init` can.
     */
    public async init(profileId: string): Promise<void> {
        this.profileId = profileId;
        this.visits$.set(newestVisitsFirst(await readVisits(profileId)));
        this.watchForWrites();
    }

    /** Which profile's history is on screen. */
    public getProfileId(): string {
        return this.profileId;
    }

    /** The history as it stands, newest first. */
    public getVisits(): Visit[] {
        return this.visits$.get();
    }

    /** Forgets one entry, on every device the profile reaches. */
    public async forget(id: string): Promise<void> {
        const stored = await readVisits(this.profileId);
        if (!stored[id]) {
            return;
        }
        delete stored[id];
        await writeVisits(this.profileId, stored);
        this.visits$.set(newestVisitsFirst(stored));
    }

    /** Forgets the lot. */
    public async forgetAll(): Promise<void> {
        await writeVisits(this.profileId, {});
        this.visits$.set([]);
    }

    /** Adopts a write made elsewhere - by the worker recording a visit, or by a pull. */
    private watchForWrites(): void {

        if (this.watching || !chrome.storage?.onChanged?.addListener) {
            return;
        }
        this.watching = true;

        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== "local") {
                return;
            }
            const incoming = changes[visitsKey(this.profileId)]?.newValue as
                Record<string, Visit> | undefined;

            if (!incoming) {
                return;
            }
            const next = newestVisitsFirst(incoming);
            if (!deepEqual(next, this.visits$.get())) {
                this.visits$.set(next);
            }
        });
    }
}
