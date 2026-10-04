import { beforeAll, describe, expect, it } from "vitest";

import { FirstRunComponent } from "../../../src/ui/components/firstRunComponent";
import { ObservableValue } from "../../../src/utils/observableValue";
import { ACT_FIRST_RUN_LOG_IN, ACT_FIRST_WORKSPACE } from "../../../src/constants";

/**
 *  The first-run screen used to be an HTML string assigned to innerHTML, with the signed-in
 *  username interpolated into it unescaped. A username is chosen by whoever registered it, so
 *  a name carrying markup became markup on an extension page. It is text now.
 *
 *  The component is drawn on its own: only its account view model is stood in for, since
 *  rendering reads nothing else.
 */
describe("FirstRunComponent", () => {

    const HOSTILE_NAME = '<img src="x" onerror="window.__injected = true">Mallory';

    beforeAll(() => {
        customElements.define("first-run-under-test", FirstRunComponent);
    });

    function drawn(account: { signedIn: boolean; username?: string }): FirstRunComponent {
        const screen = document.createElement("first-run-under-test") as FirstRunComponent;
        (screen as unknown as { ACCOUNT_VIEW_MODEL: unknown }).ACCOUNT_VIEW_MODEL = {
            observables: { account: new ObservableValue(account) }
        };
        screen.render();
        return screen;
    }

    it("shows a username carrying markup as text, and builds nothing out of it", () => {
        const screen = drawn({ signedIn: true, username: HOSTILE_NAME });

        expect(screen.querySelector("img")).toBeNull();
        expect(screen.textContent).toContain(HOSTILE_NAME);
    });

    it("still draws the buttons the screen's actions are found by", () => {
        const signedOut = drawn({ signedIn: false });

        expect(signedOut.querySelector(`#${ACT_FIRST_WORKSPACE}`)).toBeInstanceOf(HTMLButtonElement);
        expect(signedOut.querySelector(`#${ACT_FIRST_RUN_LOG_IN}`)).toBeInstanceOf(HTMLButtonElement);
    });
});
