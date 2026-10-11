import { describe, expect, it, beforeEach, vi } from "vitest";
import { InputDialog } from "../../../src/ui/partials/inputDialog";
import { MAX_NAME_LENGTH } from "../../../src/backend/sync/SyncContracts";

/**
 *  The one dialog every creation and rename goes through, and the one thing about it worth
 *  proving: it does not let a form be submitted that the account would refuse. The rules
 *  themselves are covered in fieldValidation.test.ts; what is covered here is that they are
 *  wired to a button and to a message, which is the part a user meets.
 *
 *  jsdom implements <dialog> as an element but not as a dialog - showModal and close are
 *  absent - so both are stood in for. The patch is on the prototype, which sounds alarming and
 *  is not: vitest gives every test file its own environment, so it reaches nothing else.
 */
describe("InputDialog", () => {
    beforeEach(() => {
        document.body.innerHTML = '<div class="overlay hidden"></div>';
        (HTMLDialogElement.prototype as any).showModal = function () { this.open = true; };
        (HTMLDialogElement.prototype as any).close = function () {
            this.open = false; this.dispatchEvent(new Event('close'));
        };
    });

    const ok = () => Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'OK') as HTMLButtonElement;
    const inputs = () => Array.from(document.querySelectorAll('input'));
    const errors = () => Array.from(document.querySelectorAll('.input-dialog__error')).filter(e => !(e as HTMLElement).hidden).map(e => e.textContent);

    it("will not submit until the required fields are filled, and does not nag before then", () => {
        const confirmed = vi.fn();
        new InputDialog("Add workspace", {
            "Workspace name": { type: "string", required: true, maxLength: MAX_NAME_LENGTH },
            "Workspace description": { type: "string" }
        }, confirmed).show();

        // opens disabled but silent
        expect(ok().disabled).toBe(true);
        expect(errors()).toEqual([]);
        expect(document.querySelector('.input-dialog__label')!.textContent).toBe("Workspace name *");

        // enter triggers confirm -> refuses, and now speaks up
        document.querySelector('form')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(confirmed).not.toHaveBeenCalled();
        expect(errors()).toEqual(["Workspace name is required."]);

        // typing fixes it
        const name = inputs()[0];
        name.value = "Work";
        name.dispatchEvent(new Event('input'));
        expect(ok().disabled).toBe(false);
        expect(errors()).toEqual([]);

        // too long blocks again, with the numbers in it
        name.value = "x".repeat(MAX_NAME_LENGTH + 5);
        name.dispatchEvent(new Event('input'));
        expect(ok().disabled).toBe(true);
        expect(errors()[0]).toContain(String(MAX_NAME_LENGTH));

        name.value = "Work";
        name.dispatchEvent(new Event('input'));
        ok().click();
        expect(confirmed).toHaveBeenCalledWith({ workspaceName: "Work", workspaceDescription: "" });
        expect(document.querySelector('dialog')).toBeNull();
    });

    /**
     *  The dialog focuses its first field as it opens, so leaving that field is the first thing
     *  anybody does. Counting that as having touched it printed "is required" under a field the
     *  user had not typed a character into.
     */
    it("says nothing about a field the user has only moved through", () => {
        new InputDialog("Log in", {
            "Username": { type: "string", required: true },
            "Password": { type: "password", required: true }
        }, vi.fn()).show();

        inputs()[0].dispatchEvent(new Event('blur'));
        inputs()[1].dispatchEvent(new Event('focus'));
        inputs()[1].dispatchEvent(new Event('blur'));

        expect(errors()).toEqual([]);
        expect(ok().disabled).toBe(true);
    });

    it("refuses a javascript address, and assumes https for one typed without a scheme", () => {
        const confirmed = vi.fn();
        new InputDialog("Add link", {
            "Name": { type: "string", required: true },
            "URL": { type: "url", required: true }
        }, confirmed).show();

        const [name, url] = inputs();
        name.value = "Docs"; name.dispatchEvent(new Event('input'));
        url.value = "javascript:alert(1)"; url.dispatchEvent(new Event('input'));
        expect(ok().disabled).toBe(true);
        expect(errors()[0]).toContain("cannot use javascript");

        url.value = "example.com"; url.dispatchEvent(new Event('input'));
        expect(ok().disabled).toBe(false);
        ok().click();
        expect(confirmed).toHaveBeenCalledWith({ name: "Docs", url: "https://example.com" });
    });

    it("says straight away what is wrong with a value it was opened with", async () => {
        // a rename dialog prefilled by the caller has already 'been filled in'
        const dialog = new InputDialog("Rename", { "Profile name": { type: "string", required: true, maxLength: 5 } }, () => {});
        void dialog.ask({ profileName: "far too long" });
        expect(errors()[0]).toContain("at most 5");
        expect(ok().disabled).toBe(true);
    });
});

/**
 *  What a field's value reaches the callback under.
 *
 *  This matters only because the labels are translated now. The key used to be the label,
 *  camel-cased, which meant a Slovak dialog handed `addWorkspace` a `nazovPracovnehoPriestoru`
 *  and an English one a `workspaceName` - and the callback can only be written for one of the
 *  two. Every field in the extension therefore names its own key, and the label is free to say
 *  whatever the reader's language says.
 */
describe("InputDialog field keys", () => {

    beforeEach(() => {
        document.body.innerHTML = '<div class="overlay hidden"></div>';
        (HTMLDialogElement.prototype as any).showModal = function () { this.open = true; };
        (HTMLDialogElement.prototype as any).close = function () {
            this.open = false; this.dispatchEvent(new Event('close'));
        };
    });

    const field = () => document.querySelector('input') as HTMLInputElement;
    const ok = () => Array.from(document.querySelectorAll('button'))
        .find(button => button.textContent === 'OK') as HTMLButtonElement;

    const type = (value: string): void => {
        field().value = value;
        field().dispatchEvent(new Event('input'));
    };

    it("hands the callback the key the field declared, not its label", () => {
        let received: Record<string, string> | null = null;

        new InputDialog(
            "Pridať pracovný priestor",
            {
                "Názov pracovného priestoru":
                    { type: "string", required: true, key: "workspaceName" }
            },
            values => { received = values; }
        ).show();

        type("Práca");
        ok().click();

        expect(received).toEqual({ workspaceName: "Práca" });
    });

    it("prefills by the declared key too", () => {
        new InputDialog(
            "Premenovať",
            { "Názov profilu": { type: "string", key: "profileName" } },
            () => {}
        ).show({ profileName: "Domov" });

        expect(field().value).toBe("Domov");
    });

    it("still camel-cases the label for a field that declares no key", () => {
        let received: Record<string, string> | null = null;

        new InputDialog("Add link", { "Link title": "string" }, values => { received = values; })
            .show();

        type("Docs");
        ok().click();

        expect(received).toEqual({ linkTitle: "Docs" });
    });

    /**
     *  Signing in without synchronising (#80): unticked, the device name is greyed out, left
     *  unchecked - an over-long leftover does not block the sign-in - and answers nothing.
     */
    it("disables the field a checkbox enables while the box is unticked", () => {
        const confirmed = vi.fn();
        new InputDialog("Log in", {
            "Username": { type: "string", required: true, key: "username" },
            "Synchronise": { type: "checkbox", checked: true, key: "synchronise", enables: "deviceName" },
            "Device name": { type: "string", maxLength: MAX_NAME_LENGTH, key: "deviceName" }
        }, confirmed).show();

        const ok = () => Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'OK') as HTMLButtonElement;
        const [username, synchronise, deviceName] = Array.from(document.querySelectorAll('input'));
        expect(synchronise.type).toBe("checkbox");
        expect(synchronise.checked).toBe(true);
        expect(deviceName.disabled).toBe(false);

        username.value = "kovo";
        username.dispatchEvent(new Event('input'));
        deviceName.value = "x".repeat(MAX_NAME_LENGTH + 1);
        deviceName.dispatchEvent(new Event('input'));
        expect(ok().disabled).toBe(true);

        synchronise.checked = false;
        synchronise.dispatchEvent(new Event('change'));
        expect(deviceName.disabled).toBe(true);
        expect(ok().disabled).toBe(false);

        ok().click();
        expect(confirmed).toHaveBeenCalledWith({ username: "kovo", synchronise: "false", deviceName: "" });
    });
});
