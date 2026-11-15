import { beforeEach, describe, expect, it } from "vitest";

import { AD_SLOT_READY_MESSAGE, AdsBar, followSlotLook, SlotLook } from "../../../src/ui/partials/adsBar";
import { ObservableValue } from "../../../src/utils/observableValue";
import { DevicePreferences } from "../../../src/backend/repository/DevicePreferencesRepository";

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

/** #180: the slot page is told this page's theme and accent, and follows them when they change. */
describe("AdsBar, the slot page's look", () => {

    it("passes the theme and the accent, and reloads the page only when they change", () => {
        document.body.replaceChildren();
        const look$ = new ObservableValue<SlotLook>({ theme: "dark", accent: "0036ff" });
        const bar = new AdsBar(new ObservableValue<boolean>(false), look$);
        bar.render(document.body);
        const frame = document.querySelector<HTMLIFrameElement>("iframe.ads-bar__frame")!;

        const first = new URL(frame.src);
        expect(first.searchParams.get("theme")).toBe("dark");
        expect(first.searchParams.get("accent")).toBe("0036ff");
        expect(first.searchParams.get("lang")).toBe("en");

        frame.hidden = false;           // the page said it had drawn
        look$.set({ theme: "dark", accent: "0036ff" });
        expect(frame.hidden).toBe(false);   // nothing changed: not reloaded

        look$.set({ theme: "light", accent: "e0a100" });
        const second = new URL(frame.src);
        expect(second.searchParams.get("theme")).toBe("light");
        expect(second.searchParams.get("accent")).toBe("e0a100");
        expect(frame.hidden).toBe(true);    // hidden until it has drawn again
        bar.dispose();
    });
});

describe("followSlotLook", () => {

    const preferencesWith = (theme: string, accentColor: string) => ({
        preferences$: new ObservableValue({ theme, accentColor } as unknown as DevicePreferences)
    });
    const system = (dark: boolean) => ({ matches: dark, addEventListener: () => {} }) as unknown as MediaQueryList;

    it("resolves a theme that follows the system to what the system says", () => {
        expect(followSlotLook(preferencesWith("auto", "blue"), system(true)).get().theme).toBe("dark");
        expect(followSlotLook(preferencesWith("auto", "blue"), system(false)).get().theme).toBe("light");
        expect(followSlotLook(preferencesWith("light", "blue"), system(true)).get().theme).toBe("light");
    });

    it("gives the accent as six hex digits", () => {
        expect(followSlotLook(preferencesWith("dark", "teal"), system(true)).get().accent).toBe("00707f");
    });
});
