import { FairUseRefusal, fairUseViolationIn } from "../backend/entity/FairUseLimits";
import { ProfileData } from "../backend/entity/AppStateEntity";
import { fairUseRefusals, FairUseRefusalNotice } from "../backend/repository/FairUseRefusals";
import { showNotice } from "../ui/partials/confirmations";
import { ObservableValue } from "../utils/observableValue";
import { t } from "../i18n/i18n";

/**
 *  What a fair use refusal says, in the page's language.
 *
 *  One sentence per limit, used everywhere one is reached: the notice after a refused
 *  addition, the bookmark popup, and the account menu when the account itself refused a
 *  synchronisation - so the user reads the same words whichever side noticed first.
 *
 *  @param refusal which limit, and its number
 */
export function describeFairUseRefusal(refusal: FairUseRefusal): string {
    return t(`fairUse.limits.${refusal.limit}`, { maximum: refusal.maximum });
}

/**
 *  Refuses an import that would bring in more than a fair use limit allows, saying so.
 *
 *  An import is growth all at once, so a file over a limit is refused whole rather than cut
 *  down: cutting would decide for the user which of their links to lose.
 *
 *  @param data the profile data read from the file
 *  @return true when it was refused, and nothing should be written
 */
export function refusedUnderFairUse(data: ProfileData): boolean {
    const violation = fairUseViolationIn(data);
    if (!violation) {
        return false;
    }
    fairUseRefusals.report(violation.limit);
    return true;
}

/**
 *  Tells the user, on the new tab page, whenever a fair use limit stops an addition.
 *
 *  Started once from `main.ts`. The repositories refuse and publish; this is the only place
 *  that turns a refusal into a notice.
 *
 *  @param refusals$ the published refusals; the shared channel in normal use
 *  @return a function that stops listening
 */
export function startFairUseNotices(
    refusals$: ObservableValue<FairUseRefusalNotice | null> = fairUseRefusals.refusals$
): () => void {
    let replayed = false;
    return refusals$.subscribe(notice => {
        if (!replayed) {
            // subscribe() hands over the current value at once; only what follows is news.
            replayed = true;
            return;
        }
        if (notice) {
            void showNotice(t("fairUse.title"), describeFairUseRefusal(notice));
        }
    });
}
