import { afterEach, describe, expect, it, vi } from "vitest";
import {
    openShortcutsPage, readBookmarkShortcut, SHORTCUTS_PAGE
} from "../../src/utils/extensionShortcuts";

type CommandsStub = { getAll: () => Promise<chrome.commands.Command[]> };
const chromeGlobal = (globalThis as unknown as { chrome: { commands?: CommandsStub; tabs: { create: unknown } } }).chrome;

function commandsAre(commands: chrome.commands.Command[] | Error): void {
    chromeGlobal.commands = {
        getAll: async () => {
            if (commands instanceof Error) throw commands;
            return commands;
        }
    };
}

/**
 *  Chrome lets an extension read its shortcuts but not set them, so what is pinned here is the
 *  reading - including the two ways "nothing is set" arrives - and the way to Chrome's page.
 */
describe("the bookmarking shortcut", () => {

    afterEach(() => {
        delete chromeGlobal.commands;
    });

    it("is what Chrome has bound to opening the popup", async () => {
        commandsAre([
            { name: "other", shortcut: "Ctrl+Shift+Y" },
            { name: "_execute_action", shortcut: "Ctrl+D" }
        ]);

        expect(await readBookmarkShortcut()).toBe("Ctrl+D");
    });

    it("is nothing when Chrome reports the command with no keys", async () => {
        // What a suggested key already taken by another extension looks like after install.
        commandsAre([{ name: "_execute_action", shortcut: "" }]);

        expect(await readBookmarkShortcut()).toBeNull();
    });

    it("is nothing rather than an error when Chrome cannot be asked", async () => {
        commandsAre(new Error("no commands here"));

        expect(await readBookmarkShortcut()).toBeNull();
    });

    it("is changed on Chrome's own page, opened in a tab", () => {
        const create = vi.fn();
        chromeGlobal.tabs.create = create;

        openShortcutsPage();

        expect(create).toHaveBeenCalledWith({ url: SHORTCUTS_PAGE });
        expect(SHORTCUTS_PAGE).toBe("chrome://extensions/shortcuts");
    });
});
