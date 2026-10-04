import { isFreePlanRefusal, LimitRefusal, limitViolationIn, refusalOfAnotherProfile } from "../backend/entity/FreePlanLimits";
import { ProfileData } from "../backend/entity/AppStateEntity";
import { fairUseRefusals, FairUseRefusalNotice } from "../backend/repository/FairUseRefusals";
import { premiumStanding$ } from "../backend/repository/PremiumStanding";
import { showNotice } from "../ui/partials/confirmations";
import { ChoiceDialog } from "../ui/partials/choiceDialog";
import { ObservableValue } from "../utils/observableValue";
import { t } from "../i18n/i18n";

/**
 *  What a limit's refusal says, in the page's language.
 *
 *  One sentence per limit, used everywhere one is reached: the notice after a refused
 *  addition, the bookmark popup, the account menu when the account itself refused a
 *  synchronisation, and a refused sign-in - so the user reads the same words whichever side
 *  noticed first. A free plan limit says that it is one, and that premium lifts it.
 *
 *  @param refusal which limit, and its number
 */
export function describeFairUseRefusal(refusal: LimitRefusal): string {
    return isFreePlanRefusal(refusal)
        ? t(`fairUse.freePlan.limits.${refusal.limit}`, { maximum: refusal.maximum })
        : t(`fairUse.limits.${refusal.limit}`, { maximum: refusal.maximum });
}

/**
 *  Refuses an import that would bring in more than the current plan allows, saying so.
 *
 *  An import is growth all at once, so a file over a limit is refused whole rather than cut
 *  down: cutting would decide for the user which of their links to lose. Not premium, the
 *  free plan's workspaces count too; premium, only the fair use limits.
 *
 *  @param data    the profile data read from the file
 *  @param premium the last known standing; the shared one in normal use
 *  @return true when it was refused, and nothing should be written
 */
export function refusedUnderFairUse(
    data: ProfileData,
    premium: boolean = premiumStanding$.get()
): boolean {
    const violation = limitViolationIn(data, premium);
    if (!violation) {
        return false;
    }
    fairUseRefusals.reportRefusal(violation);
    return true;
}

/**
 *  Refuses importing into a new profile when no other profile may be added, saying so before
 *  the name is asked for rather than after it was typed in vain.
 *
 *  @param existing how many profiles there are now
 *  @param premium  the last known standing; the shared one in normal use
 *  @return true when it was refused
 */
export function refusedAnotherProfile(
    existing: number,
    premium: boolean = premiumStanding$.get()
): boolean {
    const refusal = refusalOfAnotherProfile(existing, premium);
    if (!refusal) {
        return false;
    }
    fairUseRefusals.reportRefusal(refusal);
    return true;
}

/**
 *  Says a free plan refusal, offering the upgrade beside the plain acknowledgement.
 *
 *  @param refusal        which free plan limit
 *  @param openUpgradePage what the upgrade button does: the website's account page, as the
 *                         menu's upgrade offer opens it
 */
async function offerUpgrade(refusal: LimitRefusal, openUpgradePage: () => void): Promise<void> {
    const answer = await new ChoiceDialog<"upgrade" | "ok">(
        t("fairUse.freePlan.title"),
        describeFairUseRefusal(refusal),
        [
            { label: t("fairUse.freePlan.upgrade"), value: "upgrade" },
            { label: t("common.ok"), value: "ok" }
        ]
    ).ask();
    if (answer === "upgrade") {
        openUpgradePage();
    }
}

/**
 *  Tells the user, on the new tab page, whenever a limit stops an addition.
 *
 *  Started once from `main.ts`. The repositories refuse and publish; this is the only place
 *  that turns a refusal into a notice. A free plan limit's notice offers the upgrade.
 *
 *  @param openUpgradePage opens the website's account page, where premium is bought
 *  @param refusals$       the published refusals; the shared channel in normal use
 *  @return a function that stops listening
 */
export function startFairUseNotices(
    openUpgradePage: () => void,
    refusals$: ObservableValue<FairUseRefusalNotice | null> = fairUseRefusals.refusals$
): () => void {
    let replayed = false;
    return refusals$.subscribe(notice => {
        if (!replayed) {
            // subscribe() hands over the current value at once; only what follows is news.
            replayed = true;
            return;
        }
        if (notice && isFreePlanRefusal(notice)) {
            void offerUpgrade(notice, openUpgradePage);
        } else if (notice) {
            void showNotice(t("fairUse.title"), describeFairUseRefusal(notice));
        }
    });
}
