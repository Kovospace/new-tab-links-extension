import { LimitName, LimitRefusal, refusalOf } from "../entity/PlanLimits";
import { ObservableValue } from "../../utils/observableValue";
import { Logger } from "../../utils/logger";
import { planLimits$, premiumStanding$ } from "./PremiumStanding";

/**
 *  A refusal as published: the limit, and a counter so no two are ever deep-equal.
 *
 *  `ObservableValue` drops a value equal to the one before it, so the same limit reached twice
 *  in a row would otherwise be told once and then never again.
 */
export type FairUseRefusalNotice = LimitRefusal & {
    sequence: number;
};

/**
 *  Where the repositories say that something was not added because of a limit - a Fair Use
 *  cap, or the free plan's.
 *
 *  The repositories are the one door every addition comes through - a dialog, a drop, a
 *  bookmark, an import - but they have no business deciding how to tell the user. They refuse
 *  and publish here; the page's notice (`fairUseNoticeViewModel`) is what speaks. A page with
 *  nobody listening (the bookmark popup) reads the refusal off the call instead.
 */
export class FairUseRefusals {

    private readonly LOG = new Logger("FairUseRefusals");

    private issued: number = 0;

    public readonly refusals$ = new ObservableValue<FairUseRefusalNotice | null>(null);

    /**
     *  Publishes that a limit stopped something from being added, judged under the limits and
     *  standing in force.
     *
     *  @param limit which limit
     *  @return the refusal, for a caller that wants to say it itself
     */
    public report(limit: LimitName): LimitRefusal {
        return this.reportRefusal(refusalOf(limit, planLimits$.get(), premiumStanding$.get()));
    }

    /** Publishes a refusal already worked out, as it is. */
    public reportRefusal(refusal: LimitRefusal): LimitRefusal {
        this.LOG.warn("report", `Refused: ${refusal.kind} ${refusal.limit} (${refusal.maximum})`);
        this.issued += 1;
        this.refusals$.set({ ...refusal, sequence: this.issued });
        return refusal;
    }
}

export const fairUseRefusals = new FairUseRefusals();
