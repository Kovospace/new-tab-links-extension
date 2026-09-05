import { beforeEach, describe, expect, it } from "vitest";

import { ProfileRepository } from "./ProfileRepository";
import { readFakeStorage, seedFakeStorage } from "../../test/chromeStorageStub";
import { MAX_NAME_LENGTH } from "../sync/SyncContracts";

const PROFILE_REGISTRY_KEY = "profile_registry";

/** The registry shape ProfileRepository persists; mirrored here so a test can seed one. */
interface StoredRegistry {
    activeProfileId: string;
    profiles: Record<string, { id: string; name: string; createdAt: number }>;
}

function registry(activeProfileId: string, ...ids: string[]): StoredRegistry {
    return {
        activeProfileId,
        profiles: Object.fromEntries(
            ids.map(id => [id, { id, name: "Default", createdAt: 0 }]))
    };
}

describe("ProfileRepository.init", () => {

    let profiles: ProfileRepository;

    beforeEach(() => {
        profiles = new ProfileRepository();
    });

    it("seeds the default profile on a first run", async () => {
        await profiles.init();

        expect(profiles.getProfiles().map(profile => profile.id)).toEqual(["default"]);
        expect(profiles.getActiveProfileId()).toBe("default");
    });

    it("does not re-create the seeded profile once synchronisation has renamed it away", async () => {
        // This is the regression. "default" is not a UUID, so the sync layer renames that
        // profile to one the backend can store and drops the old entry. Putting it back on the
        // next start produced an empty profile the user never made - and because the sync layer
        // then gave it a storable identifier and pushed it, the account collected one junk
        // profile named "Default" per new tab page opened.
        const renamed = "0199aaaa-0000-7000-8000-00000000000a";
        seedFakeStorage(PROFILE_REGISTRY_KEY, registry(renamed, renamed));

        await profiles.init();

        expect(profiles.getProfiles().map(profile => profile.id)).toEqual([renamed]);
        expect(profiles.getProfiles()).toHaveLength(1);
    });

    it("leaves a registry of several profiles exactly as it found it", async () => {
        const first = "0199aaaa-0000-7000-8000-00000000000a";
        const second = "0199bbbb-0000-7000-8000-00000000000b";
        seedFakeStorage(PROFILE_REGISTRY_KEY, registry(second, first, second));

        await profiles.init();

        expect(profiles.getProfiles().map(profile => profile.id)).toEqual([first, second]);
        expect(profiles.getActiveProfileId()).toBe(second);
    });

    it("reseeds only when the registry has no profiles left at all", async () => {
        seedFakeStorage(PROFILE_REGISTRY_KEY, { activeProfileId: "gone", profiles: {} });

        await profiles.init();

        expect(profiles.getProfiles().map(profile => profile.id)).toEqual(["default"]);
    });

    it("points the active profile at one that exists when it names a missing one", async () => {
        const survivor = "0199aaaa-0000-7000-8000-00000000000a";
        seedFakeStorage(PROFILE_REGISTRY_KEY, registry("deleted-elsewhere", survivor));

        await profiles.init();

        expect(profiles.getActiveProfileId()).toBe(survivor);
        expect(readFakeStorage<StoredRegistry>(PROFILE_REGISTRY_KEY)?.activeProfileId)
            .toBe(survivor);
    });

    it("publishes the profiles it loaded", async () => {
        const only = "0199aaaa-0000-7000-8000-00000000000a";
        seedFakeStorage(PROFILE_REGISTRY_KEY, registry(only, only));

        await profiles.init();

        expect(profiles.profiles$.get().map(profile => profile.id)).toEqual([only]);
    });
});

describe("ProfileRepository.renameProfile", () => {

    let profiles: ProfileRepository;

    beforeEach(async () => {
        profiles = new ProfileRepository();
        await profiles.init();
    });

    it("persists the new name", async () => {
        await profiles.renameProfile("default", "Home");

        expect(readFakeStorage<StoredRegistry>(PROFILE_REGISTRY_KEY)?.profiles["default"].name)
            .toBe("Home");
    });

    it("publishes the change, which is what schedules the push to the account", async () => {
        // SyncCoordinator subscribes to profiles$ and to nothing else in this repository, so a
        // rename that only wrote storage would stay on this device for ever.
        const seen: string[] = [];
        profiles.profiles$.subscribe(list => seen.push(list.map(p => p.name).join(",")));

        await profiles.renameProfile("default", "Home");

        expect(seen).toContain("Home");
    });

    it("leaves the identifier and the creation time alone", async () => {
        const before = profiles.getProfiles()[0];

        await profiles.renameProfile("default", "Home");

        const after = profiles.getProfiles()[0];
        expect(after.id).toBe(before.id);
        expect(after.createdAt).toBe(before.createdAt);
    });

    it("ignores a profile it does not have", async () => {
        await profiles.renameProfile("0199aaaa-0000-7000-8000-00000000000a", "Ghost");

        expect(profiles.getProfiles().map(profile => profile.name)).toEqual(["Default"]);
    });

    it("does not republish when the name is the one it already has", async () => {
        // profiles$ is what wakes synchronisation up. Firing it for a rename that renamed
        // nothing would push a change set the server has already been told about.
        let publications = 0;
        profiles.profiles$.subscribe(() => publications++);
        const baseline = publications;

        await profiles.renameProfile("default", "Default");

        expect(publications).toBe(baseline);
    });
});

describe("ProfileRepository.renameProfile ordering", () => {

    it("does not move the profile among the others", async () => {
        // The change set sends each profile's index as its `position`, and the backend writes
        // that position on every upsert. A rename that reordered the registry would therefore
        // reorder the profiles on the account as a side effect of changing a label.
        const profiles = new ProfileRepository();
        await profiles.init();

        const second = (await profiles.createProfile("Second"))!;
        const third = (await profiles.createProfile("Third"))!;

        await profiles.renameProfile(second.id, "Renamed");

        expect(profiles.getProfiles().map(profile => profile.id))
            .toEqual(["default", second.id, third.id]);
    });
});

describe("ProfileRepository name limits", () => {

    let profiles: ProfileRepository;

    beforeEach(async () => {
        profiles = new ProfileRepository();
        await profiles.init();
    });

    it("refuses to create a profile whose name the account could not store", async () => {
        // Not cosmetic. The backend validates the name length over the whole push request, so
        // an over-long one fails the entire batch with a 400 rather than being rejected on its
        // own - it would sit here stopping every other change from syncing.
        expect(await profiles.createProfile("x".repeat(MAX_NAME_LENGTH + 1))).toBeNull();

        expect(profiles.getProfiles()).toHaveLength(1);
    });

    it("refuses to create a profile with a blank name", async () => {
        expect(await profiles.createProfile("   ")).toBeNull();

        expect(profiles.getProfiles()).toHaveLength(1);
    });

    it("creates a profile whose name is exactly the maximum length", async () => {
        const longest = "x".repeat(MAX_NAME_LENGTH);

        expect((await profiles.createProfile(longest))?.name).toBe(longest);
    });

    it("trims the name it is given", async () => {
        expect((await profiles.createProfile("  Work  "))?.name).toBe("Work");
    });

    it("refuses an unstorable rename even when the caller does not check", async () => {
        // The view model checks too, because it is the one that can say why. This is the
        // backstop that holds whoever calls.
        await profiles.renameProfile("default", "x".repeat(MAX_NAME_LENGTH + 1));

        expect(profiles.getProfiles()[0].name).toBe("Default");
    });
});
