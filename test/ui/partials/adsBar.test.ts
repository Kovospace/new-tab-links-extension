import { beforeEach, describe, expect, it } from "vitest";

import { AD_SLOT_READY_MESSAGE, AdsBar } from "../../../src/ui/partials/adsBar";
import { ObservableValue } from "../../../src/utils/observableValue";

describe("AdsBar", () => {

    let bar: AdsBar;
    let frame: HTMLIFrameElement;
    let premium$: ObservableValue<boolean>;

    beforeEach(() => {
        bar?.dispose();
        document.body.replaceChildren();
        premium$ = new ObservableValue<boolean>(false);
        bar = new AdsBar(premium$);
        bar.render(document.body);
        frame = document.querySelector<HTMLIFrameElement>("iframe.ads-bar__frame")!;
    });

    const post = (data: unknown, origin: string, source: Window | null = frame.contentWindow) =>
        window.dispatchEvent(new MessageEvent("message", { data, origin, source }));

    it("frames the slot page on the website, in the language being spoken", () => {
        const url = new URL(frame.src);

        expect(url.origin).toBe("https://tabilinks.app");
        expect(url.pathname).toBe("/slot/workspace-footer.html");
        expect(url.searchParams.get("lang")).toBe("en");
    });

    it("sandboxes the frame and sends it no referrer", () => {
        expect(frame.getAttribute("sandbox")).toBe(
            "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox");
        expect(frame.referrerPolicy).toBe("no-referrer");
    });

    /** An offline browser loads its own error page into the frame, and fires load for it. */
    it("stays hidden until the slot page says it has drawn", () => {
        expect(frame.hidden).toBe(true);

        post(AD_SLOT_READY_MESSAGE, "https://tabilinks.app");

        expect(frame.hidden).toBe(false);
    });

    it("ignores the message from any other origin", () => {
        post(AD_SLOT_READY_MESSAGE, "https://elsewhere.test");

        expect(frame.hidden).toBe(true);
    });

    it("ignores the message from anything but its own frame", () => {
        post(AD_SLOT_READY_MESSAGE, "https://tabilinks.app", window);

        expect(frame.hidden).toBe(true);
    });

    const slot = () => document.querySelector<HTMLElement>(".ads-bar")!;

    it("is not there at all for a premium account, and loads nothing", () => {
        premium$.set(true);

        expect(slot().hidden).toBe(true);
        expect(document.querySelector("iframe")).toBeNull();
    });

    it("comes back when the account is no longer premium", () => {
        premium$.set(true);
        premium$.set(false);

        expect(slot().hidden).toBe(false);
        expect(document.querySelectorAll("iframe")).toHaveLength(1);
    });

    it("stops listening to a frame it has taken away", () => {
        premium$.set(true);

        post(AD_SLOT_READY_MESSAGE, "https://tabilinks.app");

        expect(document.querySelector("iframe")).toBeNull();
    });
});

describe("AdsBar, for a premium account from the start", () => {

    it("never builds the frame", () => {
        document.body.replaceChildren();
        const bar = new AdsBar(new ObservableValue<boolean>(true));
        bar.render(document.body);

        expect(document.querySelector("iframe")).toBeNull();
        bar.dispose();
    });
});
