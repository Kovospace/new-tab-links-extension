import { ObservableValue } from "../../utils/observableValue";
import { FREE_PLAN_LIMITS, PlanLimits, planLimitsFrom } from "../entity/PlanLimits";
import { ChromeStorageWrapper } from "../datasource/chromeStorage/chromeStorageWrapper";
import { ACCOUNT_STANDING_KEY } from "../datasource/chromeStorage/storageKeys";

/**
 *  Whether the free plan's limits are lifted: the last known premium standing.
 *
 *  `AccountStandingRepository` decides it and publishes it here; the repositories that refuse
 *  growth only read it. It lives apart from that repository so that `AppStateRepository` and
 *  `ProfileRepository`, which the service worker and the bookmark popup load too, do not pull
 *  the HTTP client in behind them.
 *
 *  **Never waits on the network.** It starts false (free) and holds what was last stored for
 *  the signed-in account from the moment `accountStandingRepository.init()` has read storage,
 *  which the new tab page awaits before drawing. Offline it keeps that answer; signed out it
 *  is false. A page that never initialises the standing - the bookmark popup - reads false.
 */
export const premiumStanding$ = new ObservableValue<boolean>(false);

/**
 *  The limits in force on this installation: what the account last said, or the free plan's
 *  compiled numbers while nobody is signed in (`PlanLimits.ts`).
 *
 *  Published beside `premiumStanding$` by the same repository and under the same rules: never
 *  awaited from the network, kept as it was offline, back to the free numbers on sign-out.
 *  The bookmark popup reads the free numbers, which is the strictest answer and so the safe
 *  one for a page that only adds links.
 */
export const planLimits$ = new ObservableValue<PlanLimits>({ ...FREE_PLAN_LIMITS });

/** The part of the stored account standing that the limits are read from. */
interface StoredStanding {
    premium?: boolean;
    limits?: unknown;
}

/**
 *  The limits in force, read straight from storage rather than from `planLimits$`.
 *
 *  For the service worker, which records closed tabs and holds no state between wakes: it
 *  cannot wait for a page to publish anything. Signed out, nothing is stored and the free
 *  numbers apply - the same answer `planLimits$` gives.
 */
export async function readStoredPlanLimits(): Promise<PlanLimits> {
    const stored = await new ChromeStorageWrapper().get<StoredStanding>(ACCOUNT_STANDING_KEY);
    if (!stored) {
        return { ...FREE_PLAN_LIMITS };
    }
    return planLimitsFrom(stored.limits, stored.premium === true);
}
