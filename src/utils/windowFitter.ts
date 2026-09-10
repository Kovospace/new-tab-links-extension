import { Logger } from "./logger";

/**
 *  Sizing a window of this extension to the dialog it exists to show.
 *
 *  The bookmarking window has exactly one thing in it, and its height is not knowable when
 *  the service worker opens it: the subgroup dropdown appears only for a group that has
 *  subgroups, so the form grows and shrinks as the user changes the group. Guessing a size
 *  large enough for the tallest case leaves the short case sitting in empty space, and
 *  guessing small clips the buttons.
 *
 *  So the window is measured from what is actually on screen. A ResizeObserver on the dialog
 *  reports every layout that changes its size - the second dropdown appearing, a long title
 *  wrapping, the icon arriving - and the window follows. What the window has beyond its
 *  viewport is the browser's own framing, whatever that browser decided to put there, so it
 *  does not have to be known in advance.
 *
 *  The dialog's width is fixed in CSS rather than measured against the viewport, which is
 *  what keeps this from oscillating: a dialog clamped to a share of the window would shrink
 *  every time the window shrank to fit it, and so on, a few pixels at a time.
 */

const LOG = new Logger("WindowFitter");

/** Space left around the dialog, so it does not sit against the window's edges. */
const MARGIN = 12;

/** Differences smaller than this are not worth a resize, and are how a loop would start. */
const TOLERANCE = 2;

/**
 *  Keeps this window the size of the dialog open in it, for as long as one is.
 *
 *  Dialogs are found as they are added to the page, so this can be started before the dialog
 *  exists - which is what the bookmarking window does, since a dialog may be replaced by
 *  another one (the "nowhere to put it" notice) without the window changing.
 *
 *  @return a function that stops watching; the window keeps whatever size it last had
 */
export function fitWindowToOpenDialog(): () => void {

    /** The dialog being followed, so a window resize can be answered without one being open. */
    let watched: HTMLElement | null = null;

    const sizes = new ResizeObserver(entries => {
        for (const entry of entries) {
            void applySize(entry.target as HTMLElement);
        }
    });

    const watch = (element: HTMLElement): void => {
        watched = element;
        sizes.observe(element);
        void applySize(element);
    };

    document.querySelectorAll("dialog").forEach(watch);

    const added = new MutationObserver(records => {
        for (const record of records) {
            record.addedNodes.forEach(node => {
                if (node instanceof HTMLDialogElement) {
                    watch(node);
                }
            });
        }
    });
    added.observe(document.body, { childList: true });

    // The window changing size is the other half of this. A bar the browser adds after the
    // page has loaded takes its height out of the viewport without the dialog changing at
    // all, and a dialog already clamped to the viewport shrinks with it rather than asking
    // for more room. Answering the resize catches both.
    const windowResized = (): void => {
        const dialog = document.querySelector<HTMLElement>("dialog[open]") ?? watched;
        if (dialog) {
            void applySize(dialog);
        }
    };
    window.addEventListener("resize", windowResized);

    return () => {
        sizes.disconnect();
        added.disconnect();
        window.removeEventListener("resize", windowResized);
    };
}

/**
 *  What the browser reports about this window, in the units the windows API works in.
 *
 *  Two different pixels meet here. Everything measured in the page - the dialog, the viewport -
 *  is in CSS pixels, which page zoom scales; `chrome.windows` works in the browser's own
 *  device-independent pixels, which it does not. Asking the API for the window rather than
 *  reading `window.outerWidth` keeps the sum in one unit: the zoom factor converts the page's
 *  measurements up, and what is left over is the browser's framing.
 */
interface WindowFrame {
    id: number;
    width: number;
    height: number;
    /** How many device-independent pixels one CSS pixel of this page is worth. */
    zoom: number;
}

async function currentWindowFrame(): Promise<WindowFrame | null> {

    const current = await chrome.windows.getCurrent();
    if (current.id === undefined) {
        return null;
    }

    // A window the browser describes without a size is still resizable; `outerWidth` is the
    // page's own view of the same thing, and at the zoom of 1 this almost always is, the two
    // agree.
    return {
        id: current.id,
        width: current.width ?? window.outerWidth,
        height: current.height ?? window.outerHeight,
        zoom: await pageZoom()
    };
}

/** The page's zoom, or 1 when the browser will not say - which is what it almost always is. */
async function pageZoom(): Promise<number> {
    try {
        const zoom = await chrome.tabs.getZoom();
        return zoom > 0 ? zoom : 1;
    } catch {
        return 1;
    }
}

/** True while a resize is on its way, so a burst of layouts asks for one size, not five. */
let resizing = false;

/** A layout that happened while a resize was in flight, and still has to be answered. */
let missed: HTMLElement | null = null;

/** The last size asked of the browser, which is not always the size it gave. */
let lastRequested: { width: number; height: number } | null = null;

/**
 *  Makes the window the size of one element, plus the browser's framing.
 *
 *  A layout arriving mid-resize is remembered rather than dropped: the one that matters is
 *  the subgroup dropdown appearing, and losing it would leave the window too short for the
 *  buttons with nothing further to trigger another attempt.
 */
async function applySize(element: HTMLElement): Promise<void> {

    if (resizing) {
        missed = element;
        return;
    }

    resizing = true;
    try {
        await resizeOnce(element);
    } finally {
        resizing = false;
    }

    const again = missed;
    missed = null;
    if (again) {
        // Terminates: a size that is already right is inside the tolerance and asks for nothing.
        await applySize(again);
    }
}

async function resizeOnce(element: HTMLElement): Promise<void> {

    // A closed dialog measures zero, and a window of that size is not a window.
    if (!element.isConnected || element.offsetHeight === 0) {
        return;
    }

    try {
        const frame = await currentWindowFrame();
        if (!frame) {
            return;
        }

        // Whatever the browser puts around the page - the title bar, and anything a
        // particular browser adds of its own - is what the window has beyond the viewport,
        // and so needs no naming.
        const framingWidth = frame.width - (window.innerWidth * frame.zoom);
        const framingHeight = frame.height - (window.innerHeight * frame.zoom);

        // scrollHeight, not only offsetHeight: a dialog too tall for the window it is in is
        // clamped by its own max-height and scrolls, and its laid-out height would then be
        // the window's - so it would ask for the size it already has and stay clipped. What
        // it wants is the height of its contents.
        const wantedWidth = Math.max(element.offsetWidth, element.scrollWidth);
        const wantedHeight = Math.max(element.offsetHeight, element.scrollHeight);

        const width = Math.round(((wantedWidth + (MARGIN * 2)) * frame.zoom) + framingWidth);
        const height = Math.round(((wantedHeight + (MARGIN * 2)) * frame.zoom) + framingHeight);

        if (Math.abs(width - frame.width) <= TOLERANCE
            && Math.abs(height - frame.height) <= TOLERANCE) {
            return;
        }

        // The same size asked for twice means the browser gave what it could and no more -
        // a window cannot be taller than the screen. Asking again would only start a loop,
        // since each attempt is itself a resize and would come straight back here. The
        // dialog is clamped to the window and scrolls, so the form stays usable.
        if (lastRequested?.width === width && lastRequested?.height === height) {
            return;
        }
        lastRequested = { width, height };

        LOG.debug("resizeOnce",
            `${frame.width}x${frame.height} -> ${width}x${height} `
            + `(dialog ${wantedWidth}x${wantedHeight}, zoom ${frame.zoom})`);

        await chrome.windows.update(frame.id, { width, height });

    } catch (error) {
        // A window being closed while a resize is in flight is ordinary, not a failure.
        LOG.debug("resizeOnce", String(error));
    }
}
