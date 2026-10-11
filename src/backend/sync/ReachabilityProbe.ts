import { SYNC_CONFIGURATION } from "./SyncConfiguration";
import { Logger } from "../../utils/logger";

/**
 *  Why the account could not be asked whether it is premium.
 *
 *  - `offline`: nothing answers - not the account, not the website, not the rest of the
 *    internet. A browser on a plane. Nobody is punished for this.
 *  - `ourServersUnreachable`: the internet answers, tabilinks.app and its API do not. Either the
 *    whole domain is blocked on this machine, or our servers are down - which happens, so this
 *    is only held against premium after a long time.
 *  - `accountBlocked`: something of ours answers - the website, or the API host itself on its
 *    root - while the request that asks about premium did not. That is what blocking the
 *    standing endpoint looks like, and it is held against premium after a short time.
 */
export type Unreachability = "offline" | "ourServersUnreachable" | "accountBlocked";

/** Tells apart the reasons the account could not be reached; injectable for the tests. */
export interface ReachabilityProbe {
    diagnose(): Promise<Unreachability>;
}

/** How long one probe may take before it counts as no answer. */
const PROBE_TIMEOUT_MS = 8_000;

/**
 *  Addresses that answer whenever the internet does, and say nothing about tabilinks: the
 *  connectivity checks operating systems and browsers use themselves. Two, from two companies,
 *  so one of them being blocked or down does not read as "offline".
 */
const INTERNET_PROBES: readonly string[] = [
    "https://www.gstatic.com/generate_204",
    "https://1.1.1.1/cdn-cgi/trace"
];

/**
 *  Finds out, by asking a few addresses, why the account did not answer.
 *
 *  Requests are `no-cors` and carry nothing - no credentials, no identifier, no cookies -
 *  and only whether something answered at all is read: an opaque response is an answer, a
 *  failed fetch is not. Any HTTP status from our own hosts counts, a 404 or a 401 included,
 *  because the question is whether the host is reachable, not whether it likes the request.
 *  Asked only when the account has not confirmed premium for a long while
 *  (`AccountStandingRepository`), so an ordinary browser never sends one.
 */
export class FetchReachabilityProbe implements ReachabilityProbe {

    private LOG: Logger = new Logger("ReachabilityProbe");

    public async diagnose(): Promise<Unreachability> {

        const [apiAnswers, websiteAnswers] = await Promise.all([
            answers(`${SYNC_CONFIGURATION.apiBaseUrl}/`),
            answers(`${SYNC_CONFIGURATION.websiteBaseUrl}/`)
        ]);

        if (apiAnswers || websiteAnswers) {
            this.LOG.debug("diagnose", `ours answer (api ${apiAnswers}, website ${websiteAnswers})`);
            return "accountBlocked";
        }

        const internetAnswers = (await Promise.all(INTERNET_PROBES.map(answers))).some(Boolean);
        this.LOG.debug("diagnose", `ours silent, internet ${internetAnswers}`);
        return internetAnswers ? "ourServersUnreachable" : "offline";
    }
}

/** Whether anything answers at this address within the timeout. */
async function answers(url: string): Promise<boolean> {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
        return false;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    try {
        await fetch(url, {
            mode: "no-cors",
            cache: "no-store",
            credentials: "omit",
            signal: controller.signal
        });
        return true;
    } catch {
        return false;
    } finally {
        clearTimeout(timer);
    }
}
