import {
    isFreePlanRefusal, LimitRefusal, limitViolationIn, PlanLimits, refusalOfAnotherProfile
} from "../backend/entity/PlanLimits";
import { ProfileData } from "../backend/entity/AppStateEntity";
import { fairUseRefusals, FairUseRefusalNotice } from "../backend/repository/FairUseRefusals";
import { planLimits$, premiumStanding$ } from "../backend/repository/PremiumStanding";
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
 *  down: cutting would decide for the user which of their links to lose.
 *
 *  @param data    the profile data read from the file
 *  @param limits  the limits in force; the shared ones in normal use
 *  @param premium the last known standing; the shared one in normal use
 *  @return true when it was refused, and nothing should be written
 */
export function refusedUnderFairUse(
    data: ProfileData,
    limits: PlanLimits = planLimits$.get(),
    premium: boolean = premiumStanding$.get()
): boolean {
    const violation = limitViolationIn(data, limits, premium);
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
 *  @param limits   the limits in force; the shared ones in normal use
 *  @param premium  the last known standing; the shared one in normal use
 *  @return true when it was refused
 */
export function refusedAnotherProfile(
    existing: number,
    limits: PlanLimits = planLimits$.get(),
    premium: boolean = premiumStanding$.get()
): boolean {
    const refusal = refusalOfAnotherProfile(existing, limits, premium);
    if (!refusal) {
        return false;
    }
    fairUseRefusals.reportRefusal(refusal);
    return true;
}

/** What a notice can send the user on to; the page wires them to the menu's own actions. */
export interface LimitNoticeActions {
    /** The website's account page, where premium is bought. */
    openUpgradePage: () => void;
    /** The website's Fair Use Policy, which says how to ask for a raise. */
    openFairUsePage: () => void;
    /** The website's registration page. */
    openRegistrationPage: () => void;
    /** The extension's own log-in dialog. */
    openLogIn: () => void;
    /** Whether somebody is signed in right now. */
    isSignedIn: () => boolean;
}

/**
 *  Says a free plan refusal with its way on: the upgrade for a signed-in free account; for an
 *  installation nobody is signed in to - which is a free account too - logging in to one with
 *  premium, or creating one and upgrading.
 */
async function offerMore(refusal: LimitRefusal, actions: LimitNoticeActions): Promise<void> {
    if (actions.isSignedIn()) {
        const answer = await new ChoiceDialog<"upgrade" | "ok">(
            t("fairUse.freePlan.title"),
            describeFairUseRefusal(refusal),
            [
                { label: t("fairUse.freePlan.upgrade"), value: "upgrade" },
                { label: t("common.ok"), value: "ok" }
            ]
        ).ask();
        if (answer === "upgrade") {
            actions.openUpgradePage();
        }
        return;
    }
    const answer = await new ChoiceDialog<"log-in" | "register" | "ok">(
        t("fairUse.freePlan.title"),
        `${describeFairUseRefusal(refusal)} ${t("fairUse.freePlan.signedOutOffer")}`,
        [
            { label: t("fairUse.freePlan.logIn"), value: "log-in" },
            { label: t("fairUse.freePlan.register"), value: "register" },
            { label: t("common.ok"), value: "ok" }
        ]
    ).ask();
    if (answer === "log-in") {
        actions.openLogIn();
    } else if (answer === "register") {
        actions.openRegistrationPage();
    }
}

/** Says a Fair Use refusal, with the policy one click away. */
async function pointToFairUsePolicy(refusal: LimitRefusal, actions: LimitNoticeActions): Promise<void> {
    const answer = await new ChoiceDialog<"policy" | "ok">(
        t("fairUse.title"),
        describeFairUseRefusal(refusal),
        [
            { label: t("fairUse.openFairUse"), value: "policy" },
            { label: t("common.ok"), value: "ok" }
        ]
    ).ask();
    if (answer === "policy") {
        actions.openFairUsePage();
    }
}

/**
 *  Tells the user, on the new tab page, whenever a limit stops an addition.
 *
 *  Started once from `main.ts`. The repositories refuse and publish; this is the only place
 *  that turns a refusal into a notice. A free plan limit's notice offers the way past it; a
 *  Fair Use one links to the policy, which says how to ask for a raise.
 *
 *  @param actions   where the notice's buttons lead
 *  @param refusals$ the published refusals; the shared channel in normal use
 *  @return a function that stops listening
 */
export function startFairUseNotices(
    actions: LimitNoticeActions,
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
            void offerMore(notice, actions);
        } else if (notice) {
            void pointToFairUsePolicy(notice, actions);
        }
    });
}
