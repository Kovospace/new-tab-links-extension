/**
 *  Reloading the new tab page, held off while something on it is still asking the user.
 *
 *  The page reloads itself whenever what it was drawn from is gone: the profile left with no
 *  workspace, another account's profiles shown, an empty page receiving an account's workspaces
 *  (`main.ts`). A reload takes every open dialog with it. That is harmless for a page nobody is
 *  answering, and was a bug for the one place a question is asked *because of* the change that
 *  triggers a reload: signing in on a fresh install removes the untouched starter workspace, the
 *  empty profile reloads the page, and the "this device name is already in use" question that
 *  follows the sign-in flashed up and vanished, leaving a duplicate in the device list (#210).
 *
 *  So a reload asked for while a hold is in place is remembered and carried out the moment the
 *  last hold is released. It is never dropped: the page below the dialog is stale and has to be
 *  redrawn - only not before the user has answered.
 */
export class PageReloads {

    private holds: number = 0;
    private wanted: boolean = false;
    private readonly reload: () => void;

    /** @param reload what reloading means; the window's own reload in normal use */
    constructor(reload: () => void = () => window.location.reload()) {
        this.reload = reload;
    }

    /** Reloads now, or as soon as nothing holds the page any more. */
    public request(): void {
        if (this.holds > 0) {
            this.wanted = true;
            return;
        }
        this.reload();
    }

    /**
     *  Keeps the page from reloading until the returned function is called. Calling it more
     *  than once releases only once, so a release in a `finally` beside an earlier one is safe.
     *
     *  @return the release
     */
    public hold(): () => void {
        this.holds++;
        let released = false;
        return () => {
            if (released) {
                return;
            }
            released = true;
            this.holds--;
            if (this.holds === 0 && this.wanted) {
                this.wanted = false;
                this.reload();
            }
        };
    }
}

export const pageReloads = new PageReloads();
