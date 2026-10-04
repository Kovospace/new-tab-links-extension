import { defaultPlanLimits } from "../../src/backend/entity/PlanLimits";
import { planLimits$, premiumStanding$ } from "../../src/backend/repository/PremiumStanding";

/**
 *  Sets the shared standing the way `AccountStandingRepository` publishes it: whether the
 *  account is premium, and the limits that go with it (the compiled ones for that standing).
 *  The repositories read the limits, so setting the flag alone no longer lifts anything.
 *
 *  @param premium whether the account is premium; false is also "nobody signed in"
 */
export function setStanding(premium: boolean): void {
    premiumStanding$.set(premium);
    planLimits$.set(defaultPlanLimits(premium));
}
