import { ProfileData } from "../entity/AppStateEntity";
import { capExceededBy, PlanLimits } from "../entity/PlanLimits";
import { ProfileMergeEngine } from "./ProfileMergeEngine";
import { joinSlices, workspaceSlice } from "./ScopedSync";

/** What a merge within the caps produced. */
export interface CappedMergeResult {
    merged: ProfileData;
    /**
     *  Local workspaces that matched one of the account's by name but were kept apart, because
     *  joining them would have put it over a Fair Use cap. They stay local only, under their own
     *  identifier; the user is told to audit or to ask for a raise.
     */
    heldApart: { id: string; name: string }[];
}

/**
 *  Merges local data into the account's copy one workspace at a time, stopping the merge of
 *  any workspace that would go over a Fair Use cap.
 *
 *  The rules of the merge itself are `ProfileMergeEngine`'s. What this adds is the cap: the
 *  account refuses a workspace over one, and a workspace is never half synchronised, so a
 *  merge that would put one over is not made. The local workspace is carried over beside it
 *  instead, untouched - local only, because it is still named like a slot-holder
 *  (`SyncSlots.ts`) - and nothing on either side is lost.
 *
 *  A workspace that was over a cap before the merge is not this merge's doing and is joined as
 *  usual; it stops synchronising as a whole either way.
 *
 *  @param local  what this device holds
 *  @param remote what it is merged into: the account's copy, or what this device holds of it
 *  @param limits the limits in force
 */
export function mergeWithinCaps(local: ProfileData, remote: ProfileData, limits: PlanLimits): CappedMergeResult {
    let result = remote;
    const heldApart: CappedMergeResult["heldApart"] = [];
    const adopted: Record<string, string> = {};

    const workspaces = Object.values(local.environments)
        .sort((one, other) => (one.order ?? 0) - (other.order ?? 0));

    for (const workspace of workspaces) {
        const piece = workspaceSlice(local, workspace.id);
        const attempt = ProfileMergeEngine.merge(piece, result);
        const target = attempt.adoptedIds[workspace.id];

        if (target && capExceededBy(attempt.merged, target, limits) && !capExceededBy(result, target, limits)) {
            const order = Math.max(-1, ...Object.values(result.environments).map(item => item.order ?? 0)) + 1;
            piece.environments[workspace.id] = { ...workspace, order };
            result = joinSlices([result, piece], result.activeEnvironmentId);
            heldApart.push({ id: workspace.id, name: workspace.name });
            continue;
        }
        Object.assign(adopted, attempt.adoptedIds);
        result = { ...attempt.merged, activeEnvironmentId: result.activeEnvironmentId };
    }

    // The open workspace survives the merge under whatever identifier it ended up with.
    const candidates = [
        local.activeEnvironmentId ? adopted[local.activeEnvironmentId] ?? local.activeEnvironmentId : null,
        remote.activeEnvironmentId,
        Object.keys(result.environments)[0]
    ];
    return {
        merged: {
            ...result,
            activeEnvironmentId: candidates.find(id => id && result.environments[id]) ?? null
        },
        heldApart
    };
}
