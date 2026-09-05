import { beforeEach, describe, expect, it } from "vitest";

import { ProfileRepository } from "./ProfileRepository";
import { readFakeStorage, seedFakeStorage } from "../../test/chromeStorageStub";

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
