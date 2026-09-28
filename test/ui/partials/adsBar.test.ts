import { beforeEach, describe, expect, it } from "vitest";

import { AD_SLOT_READY_MESSAGE, AdsBar } from "../../../src/ui/partials/adsBar";

describe("AdsBar", () => {

    let bar: AdsBar;
    let frame: HTMLIFrameElement;

    beforeEach(() => {
        bar?.dispose();
        document.body.replaceChildren();
        bar = new AdsBar();
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
});
