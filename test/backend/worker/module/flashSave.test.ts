import { describe, expect, it } from "vitest";

import { flashSave } from "../../../../src/backend/worker/module/flashSave";
import { flashSaveGroupId } from "../../../../src/backend/worker/module/bookmarkMenuTree";
import { AppState } from "../../../../src/backend/entity/AppStateEntity";
import { PROFILE_REGISTRY_KEY, appStateKey } from "../../../../src/backend/datasource/chromeStorage/storageKeys";
import { readFakeStorage, seedFakeStorage } from "../../../support/chromeStorageStub";
import { environment, group, link, profileOf } from "../../../support/profileDataFixtures";

const PROFILE = "p";

function seed(groups = [group("grp", "Reading", "env")], extraGroups: number = 0): void {
    const filler = Array.from({ length: extraGroups }, (_, index) => group(`g${index}`, `Group ${index}`, "env", index + 10));
    const state: AppState = {
        user: { id: "u", username: "u" },
        activeProfileId: PROFILE,
        ...profileOf({
            environments: [environment("env", "Work"), environment("other", "Home")],
            groups: [...groups, ...filler],
            links: [link("old", "Old", "https://old.test", "grp", "env")],
            activeEnvironmentId: "env"
        })
    };
    seedFakeStorage(PROFILE_REGISTRY_KEY, { activeProfileId: PROFILE, profiles: {} });
    seedFakeStorage(appStateKey(PROFILE), state);
}

const stored = () => readFakeStorage<AppState>(appStateKey(PROFILE))!;

/** #204: Flash save keeps a page at once, in the open workspace's "Flash save" group. */
describe("flashSave", () => {

    it("makes the 'Flash save' group in the open workspace the first time, and saves into it", async () => {
        seed();

        expect(await flashSave({ url: "https://new.test", title: "New" })).toEqual({ kind: "saved" });

        const flash = Object.values(stored().groups).find(one => one.title === "Flash save")!;
        expect(flash.environmentId).toBe("env");
        expect(Object.values(stored().links).find(one => one.url === "https://new.test"))
            .toMatchObject({ title: "New", groupId: flash.id, environmentId: "env" });
    });

    it("uses the group it made before - and one named in another language - rather than a second", async () => {
        seed([group("grp", "Reading", "env"), group("flash", "rýchle uloženie ", "env", 1)]);

        await flashSave({ url: "https://one.test", title: "" });
        await flashSave({ url: "https://two.test", title: "Two" });

        expect(Object.values(stored().groups).map(one => one.id).sort()).toEqual(["flash", "grp"]);
        const saved = Object.values(stored().links).filter(one => one.groupId === "flash");
        expect(saved.map(one => [one.url, one.title])).toEqual(
            [["https://one.test", "https://one.test"], ["https://two.test", "Two"]]);
    });

    it("says there is no room when the workspace cannot take the group, and saves nothing", async () => {
        seed([group("grp", "Reading", "env")], 24);

        const outcome = await flashSave({ url: "https://new.test", title: "New" });

        expect(outcome.kind).toBe("refused");
        if (outcome.kind === "refused") {
            expect(outcome.message).toContain("\"Flash save\"");
            expect(outcome.message).toContain("\"Work\"");
            expect(outcome.message).toContain("25");
        }
        expect(Object.values(stored().links).map(one => one.url)).toEqual(["https://old.test"]);
    });

    it("leaves it to the form when there is no profile to save into", async () => {
        expect(await flashSave({ url: "https://new.test", title: "New" })).toEqual({ kind: "nowhere" });
    });
});

describe("flashSaveGroupId", () => {

    it("finds the group only in the open workspace", () => {
        const state = {
            ...profileOf({
                environments: [environment("env", "Work"), environment("other", "Home")],
                groups: [group("away", "Flash save", "other")],
                activeEnvironmentId: "env"
            })
        } as AppState;
        expect(flashSaveGroupId(state, ["Flash save"])).toBeNull();
    });
});
