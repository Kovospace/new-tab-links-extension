import { beforeEach, describe, expect, it } from "vitest";

import {
    ClosedTabsRepository, newestFirst, readClosedTabs, recordClosedTab, writeClosedTabs
} from "../../../src/backend/repository/ClosedTabsRepository";
import { MAX_CLOSED_TABS } from "../../../src/backend/entity/ClosedTabEntity";
import { FREE_PLAN_LIMITS, PREMIUM_PLAN_LIMITS } from "../../../src/backend/entity/PlanLimits";
import { MAX_NAME_LENGTH, MAX_TITLE_LENGTH, MAX_URL_LENGTH } from "../../../src/backend/sync/SyncContracts";
import { closedTabsKey } from "../../../src/backend/datasource/chromeStorage/storageKeys";
import { flushStorageNotifications, readFakeStorage } from "../../support/chromeStorageStub";

const PROFILE = "0199aaaa-0000-7000-8000-00000000p001";

/** A closure, described only as far as the test cares about it. */
const closure = (url: string, closedAt: number, title = "A page") =>
    ({ url, title, closedAt });

describe("recordClosedTab", () => {

    it("records what was closed", async () => {
        await recordClosedTab(PROFILE, {
            url: "https://example.com/",
            title: "Example",
            faviconUrl: "https://example.com/favicon.ico",
            closedAt: 1000,
            deviceName: "Laptop"
        });

        const [stored] = newestFirst(await readClosedTabs(PROFILE));
        expect(stored).toMatchObject({
            url: "https://example.com/",
            title: "Example",
            faviconUrl: "https://example.com/favicon.ico",
            closedAt: 1000,
            deviceName: "Laptop"
        });
        expect(stored.id).toBeTruthy();
    });

    it("keeps one entry for an address closed twice, at the later time", async () => {
        // A list that repeated itself would answer "what did I just close" with the same page
        // four times, and would spend the account's fifty rows on ten pages.
        await recordClosedTab(PROFILE, closure("https://example.com/", 1000));
        await recordClosedTab(PROFILE, closure("https://example.com/", 2000));

        const stored = newestFirst(await readClosedTabs(PROFILE));
        expect(stored).toHaveLength(1);
        expect(stored[0].closedAt).toBe(2000);
    });

    it("treats the same page reached two ways as one address", async () => {
        // Compared the way the tab catcher compares them: a trailing slash is not a
        // different page.
        await recordClosedTab(PROFILE, closure("https://example.com/page", 1000));
        await recordClosedTab(PROFILE, closure("https://example.com/page/", 2000));

        expect(newestFirst(await readClosedTabs(PROFILE))).toHaveLength(1);
    });

    it("keeps different pages apart", async () => {
        await recordClosedTab(PROFILE, closure("https://example.com/one", 1000));
        await recordClosedTab(PROFILE, closure("https://example.com/two", 2000));

        expect(newestFirst(await readClosedTabs(PROFILE))).toHaveLength(2);
    });

    /** Stores `count` closed tabs directly - recording each would read the list every time. */
    async function fillWith(count: number): Promise<void> {
        await writeClosedTabs(PROFILE, Object.fromEntries(
            Array.from({ length: count }, (_, i) => [`tab-${i}`, {
                id: `tab-${i}`, ...closure(`https://example.com/${i}`, i)
            }])));
    }

    it("keeps the newest of the plan's maximum, the oldest dropping off as a new one arrives", async () => {
        // Premium's history is the longest the panel draws.
        expect(MAX_CLOSED_TABS).toBe(PREMIUM_PLAN_LIMITS.closedTabs);
        await fillWith(PREMIUM_PLAN_LIMITS.closedTabs);

        await recordClosedTab(PROFILE, closure("https://example.com/new", 100000), PREMIUM_PLAN_LIMITS.closedTabs);

        const stored = newestFirst(await readClosedTabs(PROFILE));
        expect(stored).toHaveLength(PREMIUM_PLAN_LIMITS.closedTabs);
        expect(stored[0].url).toBe("https://example.com/new");
        expect(stored.map(tab => tab.url)).not.toContain("https://example.com/0");
    });

    it("keeps the free plan's 25 when nobody is signed in", async () => {
        await fillWith(FREE_PLAN_LIMITS.closedTabs);

        await recordClosedTab(PROFILE, closure("https://example.com/new", 100000));

        expect(await readClosedTabs(PROFILE)).toSatisfy(
            (tabs: object) => Object.keys(tabs).length === FREE_PLAN_LIMITS.closedTabs);
    });

    it("rolls a history longer than the cap rather than cutting it down at once", async () => {
        // Premium has just ended: five hundred kept, twenty-five allowed. The list loses its
        // oldest entry as each new one arrives - never four hundred and seventy-five at once.
        await fillWith(40);

        await recordClosedTab(PROFILE, closure("https://example.com/new", 100000), FREE_PLAN_LIMITS.closedTabs);

        const stored = newestFirst(await readClosedTabs(PROFILE));
        expect(stored).toHaveLength(40);
        expect(stored[0].url).toBe("https://example.com/new");
        expect(stored.map(tab => tab.url)).not.toContain("https://example.com/0");
    });

    it("orders the list newest first, whatever order things arrive in", async () => {
        await recordClosedTab(PROFILE, closure("https://example.com/old", 1000));
        await recordClosedTab(PROFILE, closure("https://example.com/older", 500));
        await recordClosedTab(PROFILE, closure("https://example.com/newest", 3000));

        expect(newestFirst(await readClosedTabs(PROFILE)).map(tab => tab.closedAt))
            .toEqual([3000, 1000, 500]);
    });

    it("keeps each profile's list to itself", async () => {
        // Profiles are separate worlds; what was closed while one was open is no business of
        // another.
        const other = "0199bbbb-0000-7000-8000-00000000p002";
        await recordClosedTab(PROFILE, closure("https://example.com/", 1000));
        await recordClosedTab(other, closure("https://elsewhere.test/", 1000));

        expect(newestFirst(await readClosedTabs(PROFILE)).map(tab => tab.url))
            .toEqual(["https://example.com/"]);
        expect(readFakeStorage(closedTabsKey(other))).toBeTruthy();
    });

    it("records nothing without a profile to record it against", async () => {
        expect(await recordClosedTab("", closure("https://example.com/", 1000))).toBeNull();
    });

    it("cuts a title the account would refuse", async () => {
        // Not one rejected row: the backend validates the size over the whole push, so one
        // long title would stop every other change on this device from reaching the account.
        // Chrome page titles run past two hundred characters routinely.
        const recorded = await recordClosedTab(
            PROFILE, closure("https://example.com/", 1000, "x".repeat(500)));

        expect(recorded!.title).toHaveLength(MAX_TITLE_LENGTH);
    });

    it("cuts a device name the account would refuse", async () => {
        const recorded = await recordClosedTab(PROFILE, {
            ...closure("https://example.com/", 1000),
            deviceName: "d".repeat(300)
        });

        expect(recorded!.deviceName).toHaveLength(MAX_NAME_LENGTH);
    });

    it("refuses an address too long to be stored at all", async () => {
        // Nothing can be trimmed off an address without changing where it points, and an
        // over-long one would fail the batch - so it is not recorded.
        const enormous = `https://example.com/${"p".repeat(MAX_URL_LENGTH)}`;

        expect(await recordClosedTab(PROFILE, closure(enormous, 1000))).toBeNull();
        expect(newestFirst(await readClosedTabs(PROFILE))).toEqual([]);
    });
});

describe("ClosedTabsRepository", () => {

    let repository: ClosedTabsRepository;

    beforeEach(async () => {
        await recordClosedTab(PROFILE, closure("https://example.com/one", 1000));
        await recordClosedTab(PROFILE, closure("https://example.com/two", 2000));

        repository = new ClosedTabsRepository();
        await repository.init(PROFILE);
    });

    it("shows what is stored, newest first", () => {
        expect(repository.getTabs().map(tab => tab.url))
            .toEqual(["https://example.com/two", "https://example.com/one"]);
    });

    it("forgets one entry", async () => {
        const [newest] = repository.getTabs();

        await repository.forget(newest.id);

        expect(repository.getTabs().map(tab => tab.url)).toEqual(["https://example.com/one"]);
        expect(Object.keys(await readClosedTabs(PROFILE))).toHaveLength(1);
    });

    it("forgets the lot", async () => {
        await repository.forgetAll();

        expect(repository.getTabs()).toEqual([]);
        expect(await readClosedTabs(PROFILE)).toEqual({});
    });

    it("shows a tab the worker recorded while the page was open", async () => {
        // The regression this exists for: the service worker writes this list, in another
        // context entirely. A page that only read it at startup would show a panel that
        // never changed while the user closed tab after tab.
        await recordClosedTab(PROFILE, closure("https://example.com/three", 3000));
        await flushStorageNotifications();

        expect(repository.getTabs().map(tab => tab.url)).toContain("https://example.com/three");
    });

    it("takes a whole list written elsewhere, which is what a pull writes", async () => {
        await writeClosedTabs(PROFILE, {
            "id-1": { id: "id-1", url: "https://pulled.test/", title: "Pulled", closedAt: 9000 }
        });
        await flushStorageNotifications();

        expect(repository.getTabs().map(tab => tab.url)).toEqual(["https://pulled.test/"]);
    });
});
