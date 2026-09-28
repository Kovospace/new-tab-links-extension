import { BackgroundWorker } from "../abstract/BackgroundWorker";
import { createNewTabUsageReporter, NewTabUsageReporter } from "../../stats/NewTabUsageReporter";

export type UsageStatsInput = Record<string, never>;
export type UsageStatsOutput = Record<string, never>;

/**
 *  Counts new tabs in the one place that can do it without races.
 *
 *  Every new tab page sends "one more" here instead of counting for itself. The worker is a
 *  single context, and the queue below runs one count after another within it, so two pages
 *  opening at once can neither overwrite each other's count nor both decide that the interval
 *  is over and send the same counts twice.
 */
export class UsageStatsWorker extends BackgroundWorker<UsageStatsInput, UsageStatsOutput> {

    private readonly reporter: NewTabUsageReporter = createNewTabUsageReporter();

    /** The count in progress; the next one waits for it. */
    private queue: Promise<void> = Promise.resolve();

    async handle(action: string, _payload: UsageStatsInput) {
        switch (action) {
            case "recordNewTab":
                this.queue = this.queue.then(() => this.reporter.recordNewTab());
                await this.queue;
                return this.response({});
            default:
                return this.errorResponse(
                    "USAGE_STATS_UNKNOWN_ACTION",
                    `Action ${action} not supported`
                );
        }
    }
}
