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

    it("sends a deletion made here wherever the account accepts one, slot or not", () => {
        // Deleted on this device: no local decision. The account lets any of its profiles be
        // deleted, and any workspace under a slot-holding profile - edits to slot-less ones
        // are refused, deletions are not.
        const account: AccountInventory = {
            profiles: [
                { id: "p", name: "Default", createdAt: 1, position: 0 },
                { id: "q", name: "Second", createdAt: 2, position: 1 }
            ],
            workspaces: [
                ...accountWith("A", "B", "C").workspaces,
                { id: "w-q", profileId: "q", name: "Q", createdAt: 20, position: 0 }
            ]
        };
        const scope = decideSyncScope(account, localWith("A"), FREE);

        expect(workspaceInScope(scope, "w-B")).toBe(true);
        expect(workspaceInScope(scope, "w-C")).toBe(true);
        expect(profileInScope(scope, "q")).toBe(true);
        // Under a profile without a slot the account refuses it; it is not sent on its own.
        expect(workspaceInScope(scope, "w-q")).toBe(false);
        expect(workspaceInScope(scope, "never-on-the-account")).toBe(false);
    });

    it("breaks a tie in createdAt by identifier as lower-case text, as the account does", () => {
        // Every row of one push shares its transaction's timestamp, so ties are the rule. The
        // account's position is not part of the order: the two ends must agree on who is first.
        const tied: AccountInventory = {
            profiles: [{ id: "p", name: "Default", createdAt: 1, position: 0 }],
            workspaces: [
                { id: "C0000000-0000-7000-8000-000000000000", profileId: "p", name: "First listed", createdAt: 10, position: 0 },
                { id: "b0000000-0000-7000-8000-000000000000", profileId: "p", name: "Second listed", createdAt: 10, position: 1 },
                { id: "a0000000-0000-7000-8000-000000000000", profileId: "p", name: "Third listed", createdAt: 10, position: 2 }
            ]
        };
        const local: LocalProfile[] = [{
            meta: meta("p", "Default"),
            data: profileOf({ environments: tied.workspaces.map(workspace => environment(workspace.id, workspace.name)) })
        }];

        const scope = decideSyncScope(tied, local, FREE);

        expect(scope.workspaces["a0000000-0000-7000-8000-000000000000"].state).toBe("SYNCHRONISED");
        expect(scope.workspaces["b0000000-0000-7000-8000-000000000000"].state).toBe("SYNCHRONISED");
        expect(scope.workspaces["C0000000-0000-7000-8000-000000000000"].state).toBe("LOCAL_ONLY_FREE_LIMIT");
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
