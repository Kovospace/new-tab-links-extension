import { FairUseLimit, fairUseRefusalOf, FairUseRefusal } from "../entity/FairUseLimits";
import { ObservableValue } from "../../utils/observableValue";
import { Logger } from "../../utils/logger";

/**
 *  A refusal as published: the limit, and a counter so no two are ever deep-equal.
 *
 *  `ObservableValue` drops a value equal to the one before it, so the same limit reached twice
 *  in a row would otherwise be told once and then never again.
 */
export interface FairUseRefusalNotice extends FairUseRefusal {
    sequence: number;
}

/**
 *  Where the repositories say that something was not added because of a fair use limit.
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
     *  Publishes that a limit stopped something from being added.
     *
     *  @param limit   which limit
     *  @param maximum its number; this extension's own unless the account said otherwise
     *  @return the refusal, for a caller that wants to say it itself
     */
    public report(limit: FairUseLimit, maximum: number = fairUseRefusalOf(limit).maximum): FairUseRefusal {
        const refusal: FairUseRefusal = { limit, maximum };
        this.LOG.warn("report", `Refused: ${limit} (${refusal.maximum})`);
        this.issued += 1;
        this.refusals$.set({ ...refusal, sequence: this.issued });
        return refusal;
    }
}

export const fairUseRefusals = new FairUseRefusals();
