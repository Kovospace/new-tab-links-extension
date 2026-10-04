import { AppState } from "../backend/entity/AppStateEntity";
import { isExampleWorkspace } from "../backend/entity/ExampleData";
import { PlanLimits } from "../backend/entity/PlanLimits";
import { appStateRepository } from "../backend/repository/AppStateRepository";
import { planLimits$ } from "../backend/repository/PremiumStanding";
import { PublishedSyncScope } from "../backend/sync/InventoryReporter";
import { sessionRepository, SyncSession } from "../backend/sync/SessionRepository";
import { syncCoordinator } from "../backend/sync/SyncCoordinator";
import { ItemSyncState } from "../backend/sync/SyncSlots";
import { t } from "../i18n/i18n";
import { ObservableValue } from "../utils/observableValue";

/** Why the open workspace does not synchronise, worded, and what the user can do about it. */
export interface WorkspaceSyncNoticeDTO {
    text: string;
    /** Whether to offer the website's account page (upgrade) and devices page (audit). */
    offerWaysOn: boolean;
}

/**
 *  Words why a profile does not synchronise, for the crossed-out mark's tooltip, or null when
 *  it does - or when nobody is signed in, where nothing synchronises and nothing is marked.
 *
 *  @param scope    what synchronises, as last decided; null while signed out or not yet known
 *  @param session  who is signed in
 *  @param profileId which profile
 *  @param limits   the limits in force, for the number in the sentence
 */
export function profileNotSyncedReason(
    scope: PublishedSyncScope | null, session: SyncSession | null, profileId: string, limits: PlanLimits
): string | null {
    const decided = currentScope(scope, session)?.profiles[profileId];
    if (!decided || decided.state === "SYNCHRONISED") {
        return null;
    }
    return withRenameAdvice(t(`sync.unsynced.profile.${decided.state}`, { maximum: limits.profiles }), decided);
}

/**
 *  Words why a workspace does not synchronise, or null when it does.
 *
 *  Example data says so whether or not anyone is signed in - it is on screen either way, and
 *  the user should know it is only an example. Everything else is said only while signed in.
 *
 *  @param scope       what synchronises, as last decided
 *  @param session     who is signed in
 *  @param state       the open profile's data, for the example flag
 *  @param workspaceId which workspace
 *  @param limits      the limits in force
 */
export function workspaceNotSyncedNotice(
    scope: PublishedSyncScope | null, session: SyncSession | null, state: AppState,
    workspaceId: string, limits: PlanLimits
): WorkspaceSyncNoticeDTO | null {
    if (isExampleWorkspace(state.environments[workspaceId])) {
        return { text: t("sync.unsynced.workspace.EXAMPLE"), offerWaysOn: false };
    }
    const known = currentScope(scope, session);
    const decided = known?.workspaces[workspaceId];
    if (!known || !decided || decided.state === "SYNCHRONISED" || decided.state === "EXAMPLE") {
        return null;
    }
    const profileState = known.profiles[state.activeProfileId];
    if (profileState && profileState.state !== "SYNCHRONISED" && profileState.state !== "EXAMPLE") {
        // The profile holds no slot, and so no workspace in it does: say that, not something
        // about workspaces.
        return {
            text: withRenameAdvice(
                t(`sync.unsynced.workspaceOfProfile.${profileState.state}`, { maximum: limits.profiles }),
                profileState),
            offerWaysOn: true
        };
    }
    return {
        text: withRenameAdvice(
            t(`sync.unsynced.workspace.${decided.state}`, { maximum: limits.workspacesPerProfile }),
            decided),
        offerWaysOn: true
    };
}

/** The scope, only when it is about the account signed in now. */
function currentScope(scope: PublishedSyncScope | null, session: SyncSession | null): PublishedSyncScope | null {
    return scope && session && scope.accountId === session.userId ? scope : null;
}

/** Adds "rename it to ... to merge it" when the account has slot-holders to merge into. */
function withRenameAdvice(text: string, decided: ItemSyncState): string {
    if (!decided.renameTo || decided.renameTo.length === 0) {
        return text;
    }
    const names = decided.renameTo.map(name => `"${name}"`).join(", ");
    return `${text} ${t("sync.unsynced.renameAdvice", { names })}`;
}

/**
 *  Publishes a tick whenever anything the unsynchronised marks depend on changes - the scope,
 *  the session, the limits - so that whoever draws them redraws.
 */
export class SyncStateViewModel {

    public readonly changes$ = new ObservableValue<number>(0);

    private scope: PublishedSyncScope | null = null;
    private session: SyncSession | null = null;

    /** Starts listening; fires once at once. */
    public initialize(): void {
        syncCoordinator.scope$.subscribe(scope => { this.scope = scope; this.tick(); });
        sessionRepository.session$.subscribe(session => { this.session = session; this.tick(); });
        planLimits$.subscribe(() => this.tick());
        // An edit clears a workspace's example flag, which takes its notice away.
        appStateRepository.state$.subscribe(() => this.tick());
    }

    /** Why a profile does not synchronise, or null; see `profileNotSyncedReason`. */
    public profileReason(profileId: string): string | null {
        return profileNotSyncedReason(this.scope, this.session, profileId, planLimits$.get());
    }

    /** Why the given workspace of the open profile does not synchronise, or null. */
    public workspaceNotice(workspaceId: string): WorkspaceSyncNoticeDTO | null {
        return workspaceNotSyncedNotice(
            this.scope, this.session, appStateRepository.state$.get(), workspaceId, planLimits$.get());
    }

    private tick(): void {
        this.changes$.set(this.changes$.get() + 1);
    }
}

export const syncStateViewModel = new SyncStateViewModel();
