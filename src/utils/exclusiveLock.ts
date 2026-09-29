/**
 *  Runs work that no other page of this extension may be running at the same time.
 *
 *  Every new tab page is a document of its own with its own copy of every module, so a
 *  variable cannot serialise anything between them. The Web Locks API can: a lock is held per
 *  origin, and every page of an extension shares the extension's origin. The lock is released
 *  when the work settles, or when the page holding it is closed - a tab shut mid-refresh cannot
 *  leave the others waiting for ever.
 *
 *  Where the API is absent (jsdom, which is where the tests run) the work is still serialised
 *  within the page, which is the most that can be promised without it.
 */

/** The tail of the work queued under each name, for when the Web Locks API is absent. */
const queuesWithinThisPage = new Map<string, Promise<unknown>>();

export async function withExclusiveLock<RESULT>(
    lockName: string,
    work: () => Promise<RESULT>
): Promise<RESULT> {

    const lockManager = typeof navigator !== "undefined" ? navigator.locks : undefined;
    if (lockManager?.request) {
        // Older DOM typings describe the callback's promise as the result rather than its value;
        // awaiting it gives the value under either.
        return await lockManager.request(lockName, () => work());
    }

    const previous = queuesWithinThisPage.get(lockName) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(work);
    queuesWithinThisPage.set(lockName, next.catch(() => undefined));
    return next;
}
