import { beforeEach, describe, expect, it, vi } from "vitest";

import { signInStepByStep } from "../../../src/ui/partials/signInDialog";
import { SyncAccountViewModel } from "../../../src/viewModel/syncAccountViewModel";

/**
 *  #182: "Log in / set up sync" asks for the method first, then shows that method's form
 *  only. jsdom has no working <dialog>, so showModal and close are stood in, as in the
 *  InputDialog test.
 */
describe("signInStepByStep", () => {

    beforeEach(() => {
        document.body.innerHTML = "";
        (HTMLDialogElement.prototype as any).showModal = function () { this.open = true; };
        // A browser fires "close" as a task of its own, after the code that closed the dialog
        // has finished - which is what lets a confirmed form's answer arrive before it.
        (HTMLDialogElement.prototype as any).close = function () {
            this.open = false;
            setTimeout(() => this.dispatchEvent(new Event("close")), 0);
        };
    });

    const button = (label: string) => Array.from(document.querySelectorAll("dialog button"))
        .find(candidate => candidate.textContent === label) as HTMLButtonElement;
    const labels = () => Array.from(document.querySelectorAll("dialog label")).map(label => label.textContent);
    const settle = () => new Promise(resolve => setTimeout(resolve, 0));

    function account() {
        return {
            logIn: vi.fn(() => Promise.resolve(null)),
            connectWithCode: vi.fn(() => Promise.resolve(null)),
            finishSignIn: vi.fn(() => Promise.resolve())
        } as unknown as SyncAccountViewModel & {
            logIn: ReturnType<typeof vi.fn>; connectWithCode: ReturnType<typeof vi.fn>
        };
    }

    it("offers the two methods first, and no field yet", () => {
        void signInStepByStep(account(), () => {});

        expect(button("I have a username and password")).toBeDefined();
        expect(button("I have a sync code")).toBeDefined();
        expect(button("Cancel")).toBeDefined();
        expect(document.querySelectorAll("dialog input")).toHaveLength(0);
    });

    it("shows only the sync code form after choosing the sync code, and connects with it", async () => {
        const signingIn = account();
        const signedIn = vi.fn();
        const done = signInStepByStep(signingIn, signedIn);

        button("I have a sync code").click();
        await settle();
        expect(labels()).toContain("Connect code *");
        expect(labels().some(label => label?.startsWith("Password"))).toBe(false);

        const code = document.querySelector<HTMLInputElement>("dialog input")!;
        code.value = "ABC-123";
        code.dispatchEvent(new Event("input"));
        button("OK").click();
        await done;
        await settle();

        expect(signingIn.connectWithCode).toHaveBeenCalledWith("ABC-123", "", true);
        expect(signingIn.logIn).not.toHaveBeenCalled();
        expect(signedIn).toHaveBeenCalled();
    });

    it("goes back to the choice when the form is cancelled - the wrong method was picked", async () => {
        void signInStepByStep(account(), () => {});

        button("I have a username and password").click();
        await settle();
        expect(labels().some(label => label?.startsWith("Password"))).toBe(true);

        button("Cancel").click();
        await settle();
        expect(button("I have a sync code")).toBeDefined();
    });
});
