import { describe, expect, it } from "vitest";

import { FREE_PLAN_LIMITS, PREMIUM_PLAN_LIMITS } from "../../../src/backend/entity/PlanLimits";
import { ProfileMeta } from "../../../src/backend/entity/AppStateEntity";
import {
    AccountInventory, decideSyncScope, LocalProfile, profileInScope, workspaceInScope
} from "../../../src/backend/sync/SyncSlots";
import { pulledProfileData } from "../../../src/backend/sync/ScopedSync";
import { environment, group, profileOf } from "../../support/profileDataFixtures";

const FREE = { limits: FREE_PLAN_LIMITS, premium: false };
const PREMIUM = { limits: PREMIUM_PLAN_LIMITS, premium: true };

function meta(id: string, name: string, createdAt = 0, extra: Partial<ProfileMeta> = {}): ProfileMeta {
    return { id, name, createdAt, ...extra };
}

/** An account with one profile `p` holding the named workspaces, oldest first. */
function accountWith(...workspaceNames: string[]): AccountInventory {
    return {
        profiles: [{ id: "p", name: "Default", createdAt: 1, position: 0 }],
        workspaces: workspaceNames.map((name, index) => ({
            id: `w-${name}`, profileId: "p", name, createdAt: 10 + index, position: index
        }))
    };
}

/** Profile `p` on this device, holding the named workspaces. */
function localWith(...workspaceNames: string[]): LocalProfile[] {
    return [{
        meta: meta("p", "Default"),
        data: profileOf({
            environments: workspaceNames.map((name, index) => ({ ...environment(`w-${name}`, name, index), createdAt: 100 + index }))
        })
    }];
}

/**
 *  The slot rules: the account's `createdAt` decides who is first, the account's items keep
 *  their slots, and what this device brings takes what is left - nothing more.
 */
describe("decideSyncScope", () => {

    it("leaves a third workspace local only when the account already has two, advising a rename", () => {
        const scope = decideSyncScope(accountWith("A", "B"), localWith("A", "B", "C"), FREE);

        expect(scope.workspaces["w-A"].state).toBe("SYNCHRONISED");
        expect(scope.workspaces["w-B"].state).toBe("SYNCHRONISED");
        expect(scope.workspaces["w-C"]).toEqual({ state: "LOCAL_ONLY_FREE_LIMIT", renameTo: ["A", "B"] });
    });

    it("gives the free slot to what this device brings when there is one", () => {
        const scope = decideSyncScope(accountWith("A"), localWith("A", "B", "C"), FREE);

        expect(scope.workspaces["w-B"].state).toBe("SYNCHRONISED");
        expect(scope.workspaces["w-C"].state).toBe("LOCAL_ONLY_FREE_LIMIT");
    });

    it("orders the account's own by when they reached it, not by anything done here", () => {
        // Premium has ended: the account holds three, the free plan two. The oldest two keep
        // their slots, whatever order this device lists them in.
        const account = accountWith("A", "B", "C");
        const local = localWith("C", "B", "A");

        const scope = decideSyncScope(account, local, FREE);

        expect(scope.workspaces["w-A"].state).toBe("SYNCHRONISED");
        expect(scope.workspaces["w-B"].state).toBe("SYNCHRONISED");
        expect(scope.workspaces["w-C"].state).toBe("LOCAL_ONLY_FREE_LIMIT");
        expect(decideSyncScope(account, local, PREMIUM).workspaces["w-C"].state).toBe("SYNCHRONISED");
    });

    it("keeps a workspace over a Fair Use cap out as a whole", () => {
        const local = localWith("A");
        local[0].data = {
            ...local[0].data!,
            groups: Object.fromEntries(Array.from({ length: 26 }, (_, index) =>
                [`g-${index}`, group(`g-${index}`, `G ${index}`, "w-A", index)]))
        };

        expect(decideSyncScope(accountWith("A"), local, PREMIUM).workspaces["w-A"].state).toBe("LOCAL_ONLY_FAIR_USE");
    });

    it("never synchronises example data, and example data takes no slot", () => {
        const local = localWith("A", "Example", "B");
        local[0].data!.environments["w-Example"].example = "fingerprint";

        const scope = decideSyncScope(accountWith("A"), local, FREE);

        expect(scope.workspaces["w-Example"].state).toBe("EXAMPLE");
        expect(scope.workspaces["w-B"].state).toBe("SYNCHRONISED");
    });

    it("gives a profile without a slot no workspace slots either", () => {
        const local: LocalProfile[] = [
            ...localWith("A"),
            { meta: meta("q", "Second", 5), data: profileOf({ environments: [environment("w-q", "Q")] }) }
        ];

        const scope = decideSyncScope(accountWith("A"), local, FREE);

        expect(scope.profiles["q"]).toEqual({ state: "LOCAL_ONLY_FREE_LIMIT", renameTo: ["Default"] });
        expect(scope.workspaces["w-q"].state).toBe("LOCAL_ONLY_FREE_LIMIT");
    });

    it("judges a deletion made here by whether the account's record holds a slot", () => {
        // Deleted on this device: no local decision, so the account's slot says whether the
        // deletion is sent. One without a slot is not deleted from the account.
        const scope = decideSyncScope(accountWith("A", "B", "C"), localWith("A"), FREE);

        expect(workspaceInScope(scope, "w-B")).toBe(true);
        expect(workspaceInScope(scope, "w-C")).toBe(false);
        expect(profileInScope(scope, "p")).toBe(true);
    });
});

/**
 *  The pull writes over what is in scope and nothing else - the fix for "Sync silently deletes
 *  a record the server refused", where a pull replaced a profile wholesale.
 */
describe("pulledProfileData", () => {

    const incoming = profileOf({ environments: [environment("A", "A from the account")] });
    const local = profileOf({
        environments: [environment("A", "A here"), environment("gone", "Deleted elsewhere"),
            environment("mine", "Local only"), environment("slotless", "No slot")],
        groups: [group("g-mine", "Kept", "mine")]
    });

    it("takes the account's copy of what is in scope, and keeps what is local only", () => {
        const pulled = pulledProfileData(
            local, { ...incoming, environments: { ...incoming.environments, slotless: environment("slotless", "Theirs") } },
            id => id !== "slotless", new Set(["A", "gone"]), new Set());

        expect(pulled.environments["A"].name).toBe("A from the account");
        expect(pulled.environments["mine"]).toBeDefined();
        expect(pulled.groups["g-mine"]).toBeDefined();
        // The account's without a slot: this device's copy, untouched.
        expect(pulled.environments["slotless"].name).toBe("No slot");
        // Held by the account before, and no more: deleted elsewhere.
        expect(pulled.environments["gone"]).toBeUndefined();
    });

    it("drops this device's copy of something the server stored under another identifier", () => {
        const pulled = pulledProfileData(local, incoming, () => true, new Set(), new Set(["mine"]));

        expect(pulled.environments["mine"]).toBeUndefined();
    });
});
