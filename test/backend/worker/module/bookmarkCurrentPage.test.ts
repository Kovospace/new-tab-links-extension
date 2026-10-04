import { describe, expect, it } from "vitest";

import { saveInto } from "../../../../src/backend/worker/module/bookmarkCurrentPage";
import { AppState } from "../../../../src/backend/entity/AppStateEntity";
import {
    PROFILE_REGISTRY_KEY,
    appStateKey
} from "../../../../src/backend/datasource/chromeStorage/storageKeys";
import { readFakeStorage, seedFakeStorage } from "../../../support/chromeStorageStub";
import { environment, group, link, profileOf, subgroup } from "../../../support/profileDataFixtures";

const PROFILE = "p";

function seedProfile(): void {
    const state: AppState = {
        user: { id: "u", username: "u" },
        activeProfileId: PROFILE,
        ...profileOf({
            environments: [environment("env", "Work")],
            groups: [group("grp", "Group", "env")],
            subgroups: [subgroup("sub", "Sub", "grp", "env", 0)],
            links: [link("old", "Old", "https://old.test", "grp", "env", { position: 1 })],
            activeEnvironmentId: "env"
        })
    };
    seedFakeStorage(PROFILE_REGISTRY_KEY, { activeProfileId: PROFILE, profiles: {} });
    seedFakeStorage(appStateKey(PROFILE), state);
}

function storedLinks() {
    return Object.values(readFakeStorage<AppState>(appStateKey(PROFILE))!.links);
}

/**
 *  Saving straight from the right-click submenu. It writes the user's profile from the worker,
 *  with no form in between, so what it must never do is file a link somewhere the menu did not
 *  say - or claim success when it stored nothing, which would leave the user with a tick and
 *  no link.
 */
describe("saveInto", () => {

    it("stores the link in the chosen subgroup of the chosen group", async () => {
        seedProfile();

        const saved = await saveInto(
            { groupId: "grp", subgroupId: "sub" },
            { url: "https://new.test", title: "New" });

        expect(saved).toBe(true);
        const created = storedLinks().find(candidate => candidate.url === "https://new.test");
        expect(created).toMatchObject({
            title: "New", groupId: "grp", subGroupId: "sub", environmentId: "env"
        });
    });

    it("names a link with no title after its address", async () => {
        seedProfile();

        await saveInto({ groupId: "grp" }, { url: "https://untitled.test", title: "  " });

        expect(storedLinks().find(candidate => candidate.url === "https://untitled.test")?.title)
            .toBe("https://untitled.test");
    });

    it("stores nothing and says so when the group was deleted after the menu was drawn", async () => {
        seedProfile();

        const saved = await saveInto({ groupId: "grp-gone" }, { url: "https://x.test", title: "X" });

        expect(saved).toBe(false);
        expect(storedLinks().map(candidate => candidate.id)).toEqual(["old"]);
    });

    it("refuses a subgroup that is no longer in the group it was offered under", async () => {
        seedProfile();

        const saved = await saveInto(
            { groupId: "grp", subgroupId: "sub-gone" },
            { url: "https://x.test", title: "X" });

        expect(saved).toBe(false);
    });

    it("stores nothing when there is no profile to store into", async () => {
        expect(await saveInto({ groupId: "grp" }, { url: "https://x.test", title: "X" })).toBe(false);
    });
});
