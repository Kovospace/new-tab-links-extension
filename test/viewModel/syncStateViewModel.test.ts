import { describe, expect, it } from "vitest";

import { workspaceNotSyncedNotice } from "../../src/viewModel/syncStateViewModel";
import { appStateInit } from "../../src/backend/datasource/init/AppStateInit";
import { FREE_PLAN_LIMITS } from "../../src/backend/entity/PlanLimits";
import { AppState } from "../../src/backend/entity/AppStateEntity";
import { t } from "../../src/i18n/i18n";

/** The "not synchronised" notice in the workspace head, for example data. */
describe("workspaceNotSyncedNotice", () => {

    const flagged: AppState = {
        ...appStateInit,
        environments: { w: { id: "w", name: "My workspace", createdAt: 0, order: 0, example: "fingerprint" } }
    };

    // #182: the starter is flagged like the examples so that it is not synchronised, but there
    // is nothing in it to call an example.
    it("says nothing about the page's empty starter workspace", () => {
        expect(workspaceNotSyncedNotice(null, null, flagged, "w", FREE_PLAN_LIMITS)).toBeNull();
    });

    it("still says that the examples are only examples", () => {
        const examples: AppState = {
            ...flagged,
            groups: { g: { id: "g", environmentId: "w", title: "Search", createdAt: 0, order: 0 } }
        };
        expect(workspaceNotSyncedNotice(null, null, examples, "w", FREE_PLAN_LIMITS)?.text)
            .toBe(t("sync.unsynced.workspace.EXAMPLE"));
    });
});
