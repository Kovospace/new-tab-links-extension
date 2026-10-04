import { ObservableValue } from "../../utils/observableValue";

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
 *  is false. A page that never initialises the standing - the bookmark popup - reads false,
 *  which costs nothing there: it only adds links, and links have no free plan limit.
 */
export const premiumStanding$ = new ObservableValue<boolean>(false);
