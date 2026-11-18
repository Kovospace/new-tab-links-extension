import { test } from "./support/test";
import type { NewTabPage } from "./support/newTabPage";
import type { Translate } from "./support/i18n";

/**
 *  The pictures of the website's download page tutorial, "Enable synchronization": signing the
 *  extension in, with a username and password or with a sync code. The names are the ones the
 *  page already references, `public/images/<lang>/install/<name>_3x.png`, so a refreshed picture
 *  replaces the old one in place. Dark, as the website is.
 *
 *  Since #182 "Log in" asks for the method first - there is no "Enter sync code" in the menu.
 */
test.use({ deviceScaleFactor: 3 });

/** The built-in picture behind the page - the tips' own. */
const BACKGROUND = 6;

/** The staged account's name, as the signed-in menu shows it. */
const ACCOUNT = "alex";

/** Signs the staged account out, so the page is a signed-out browser's. */
async function signOut(newTab: NewTabPage): Promise<void> {
    await newTab.page.evaluate(() => chrome.storage.local.remove(["sync_session", "account_standing"]));
    await newTab.reload();
}

/** The application menu open - the ⋮ at the top right - waited for while it fades in. */
async function openAppMenu(newTab: NewTabPage): Promise<void> {
    await newTab.page.click(".action-app-menu");
    await newTab.page.locator("options-menu.visible").waitFor();
    await newTab.page.waitForTimeout(300);
}

/** "Log in" from the menu, then the method dialog, waited for. */
async function openMethodChoice(newTab: NewTabPage, t: Translate): Promise<void> {
    await openAppMenu(newTab);
    await newTab.page.locator(newTab.menuItem("sync.menu.logIn")).click();
    await newTab.page.locator("dialog[open]").last().getByText(t("sync.signInDialog.withPassword")).waitFor();
    await newTab.pointerAway();
    await newTab.page.waitForTimeout(300);
}

/** A button of the open dialog, by its wording. */
function dialogButton(newTab: NewTabPage, label: string) {
    return newTab.page.locator("dialog[open]").last().getByRole("button", { name: label, exact: true });
}

/** Rests the drawn pointer on a dialog's button and frames it. */
async function pointAt(newTab: NewTabPage, label: string): Promise<void> {
    const box = (await dialogButton(newTab, label).boundingBox())!;
    await newTab.movePointerTo(box.x + box.width * 0.6, box.y + box.height * 0.6);
    await newTab.outline(box, 4, 4);
}

test.describe("signed out", () => {
    test.beforeEach(async ({ newTab }) => {
        await newTab.chooseBackground(BACKGROUND);
        await signOut(newTab);
    });

    test("the menu, log in hovered", async ({ newTab, shoot }) => {
        await openAppMenu(newTab);
        await newTab.hoverMenuItem("sync.menu.logIn");
        await newTab.outline(newTab.menuItem("sync.menu.logIn"), 3, 4);
        await shoot("standart-login-menu_3x",
            { clip: await newTab.areaAround([".action-user-profiles-menu", ".action-app-menu", "options-menu.visible"], 20) });
    });

    test("the method, username and password pointed at", async ({ newTab, shoot, t }) => {
        await openMethodChoice(newTab, t);
        await pointAt(newTab, t("sync.signInDialog.withPassword"));
        await shoot("standart-login-method_3x", { clip: await newTab.areaAround(["dialog[open]"], 16) });
    });

    test("the username and password form", async ({ newTab, shoot, t }) => {
        await openMethodChoice(newTab, t);
        await dialogButton(newTab, t("sync.signInDialog.withPassword")).click();
        await newTab.page.locator("dialog[open] input[type=password]").last().waitFor();
        await newTab.pointerAway();
        await newTab.page.waitForTimeout(300);
        await shoot("standart-login-form_3x", { clip: await newTab.areaAround(["dialog[open] >> nth=-1"], 16) });
    });

    test("the method, sync code pointed at", async ({ newTab, shoot, t }) => {
        await openMethodChoice(newTab, t);
        await pointAt(newTab, t("sync.signInDialog.withCode"));
        await shoot("use-connection-code-3_3x", { clip: await newTab.areaAround(["dialog[open]"], 16) });
    });

    test("the sync code form", async ({ newTab, shoot, t }) => {
        await openMethodChoice(newTab, t);
        await dialogButton(newTab, t("sync.signInDialog.withCode")).click();
        await newTab.page.locator("dialog[open]").last()
            .getByText(t("sync.syncCodeDialog.title"), { exact: true }).waitFor();
        await newTab.pointerAway();
        await newTab.page.waitForTimeout(300);
        await shoot("use-connection-code-4_3x", { clip: await newTab.areaAround(["dialog[open] >> nth=-1"], 16) });
    });
});

test.describe("signed in", () => {
    test("the menu, signed in and synchronised", async ({ newTab, shoot, t }) => {
        await newTab.chooseBackground(BACKGROUND);
        // Synchronising on this browser - the staging turns it off - so the status row is ticked.
        await newTab.setPreferences({ syncEnabled: true });
        await newTab.page.evaluate(account => chrome.storage.local.get("sync_session").then(
            ({ sync_session: session }) => chrome.storage.local.set(
                { sync_session: { ...(session as object), username: account } })), ACCOUNT);
        await newTab.reload();
        await openAppMenu(newTab);
        await newTab.pointerAway();
        // Wait for the status to settle on what the refused API makes of it, so the menu does
        // not redraw over the wording below.
        await newTab.page.locator("options-menu.visible").getByText(t("sync.status.offline")).waitFor({ timeout: 30_000 });
        // The staging refuses the account's API, so the status would read "offline"; a user whose
        // account answers sees "Synchronised" there, and that is what the tutorial shows.
        // Kept rewritten while the picture is taken: the menu redraws itself on every status change.
        await newTab.page.locator("options-menu.visible").evaluate((menu, wording) => {
            const rewrite = (): void => {
                const walker = document.createTreeWalker(menu, NodeFilter.SHOW_TEXT);
                for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                    const text = node.textContent ?? "";
                    const other = wording.others.find(candidate => text.includes(candidate));
                    if (other) node.textContent = text.replace(other, wording.idle);
                }
            };
            rewrite();
            new MutationObserver(rewrite).observe(menu, { childList: true, subtree: true, characterData: true });
        }, { idle: t("sync.status.idle"),
            others: [t("sync.status.offline"), t("sync.status.working"), t("sync.status.off")] });
        await newTab.page.waitForTimeout(500);
        const clip = await newTab.areaAround([".action-user-profiles-menu", ".action-app-menu", "options-menu.visible"], 20);
        await shoot("standart-login-menu-logged_3x", { clip });
        await shoot("use-connection-code-5_3x", { clip });
    });
});
