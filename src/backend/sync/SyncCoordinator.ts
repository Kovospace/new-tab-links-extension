import { ProfileData, ProfileMeta } from "../entity/AppStateEntity";
import { AppStateRepository, appStateRepository } from "../repository/AppStateRepository";
import { ProfileRepository, profileRepository } from "../repository/ProfileRepository";
import { uid } from "../repository/AppStateRepositoryUtils";

import { BackendApiClient, backendApiClient } from "./BackendApiClient";
import { ChangeSetBuilder, SyncBaseline } from "./ChangeSetBuilder";
import { installationIdentity } from "./InstallationIdentity";
import { isStorableIdentifier, LocalIdentifierNormalizer } from "./LocalIdentifierNormalizer";
import { ProfileMergeEngine } from "./ProfileMergeEngine";
import { RefreshChannel } from "./RefreshChannel";
import { SessionRepository, sessionRepository, SyncSession } from "./SessionRepository";
import { MappedSnapshot, SyncSnapshotMapper } from "./SyncSnapshotMapper";
import { SyncBaselineRepository, syncBaselineRepository } from "./SyncBaselineRepository";
import { SyncOperation, SyncRejectedOperation } from "./SyncContracts";
import { ClosedTab } from "../entity/ClosedTabEntity";
import { readClosedTabs, writeClosedTabs } from "../repository/ClosedTabsRepository";
import { Visit } from "../entity/VisitEntity";
import { readVisits, writeVisits } from "../repository/VisitsRepository";
import { settingsOf } from "../entity/ProfileSettings";

import { Logger } from "../../utils/logger";
import { withExclusiveLock } from "../../utils/exclusiveLock";
import { ObservableValue } from "../../utils/observableValue";
import { LimitRefusal } from "../entity/PlanLimits";
import { fairUseRefusals, FairUseRefusals } from "../repository/FairUseRefusals";
import { planLimits$, premiumStanding$ } from "../repository/PremiumStanding";
import { isExampleProfile, isExampleWorkspace } from "../entity/ExampleData";
import { accountStandingRepository } from "./AccountStandingRepository";
import {
    AccountInventory, asName, decideSyncScope, inventoryFromLists, inventoryFromSnapshot, LocalProfile,
    profileInScope, SlotRules, slotHolders, SyncScope, workspaceInScope
} from "./SyncSlots";
import { baselineAfter, dataWithin, InScope, joinSlices, pulledProfileData, restrictToScope, workspaceSlice } from "./ScopedSync";
import { mergeWithinCaps } from "./CappedMerge";
import { InventoryReporter, PublishedSyncScope } from "./InventoryReporter";

/** How long to wait after a local change before pushing, so a burst becomes one request. */
const PUSH_DEBOUNCE = 800;

/** How long to wait after being told the account changed elsewhere before pulling. */
const PULL_DEBOUNCE = 400;

/**
 *  Held while a sign-in decides whose profiles are visible. Every open new tab page reacts to a
 *  sign-in, and two deciding at once from what each loaded at startup could both swap the set.
 */
const ACCOUNT_TRANSITION_LOCK = "tabilinks-account-transition";

/** What the account menu can say about synchronisation. */
export type SyncActivity = "idle" | "working" | "offline";

/**
 *  Why a push is happening, which decides whether it is allowed to delete.
 *
 *  A device that has just merged with an account it had never seen holds a picture built from
 *  one snapshot and its own contents. Nothing in that picture is evidence that the user
 *  removed anything, so a deletion computed there is a bug in the merge rather than an
 *  instruction, and is refused. Every later push is a genuine difference against a state the
 *  server confirmed, where an absent record really does mean the user deleted it.
 */
type PushOccasion = "first-contact" | "steady-state";

/** The push that ends a first merge with an account. */
const FIRST_CONTACT: PushOccasion = "first-contact";

/**
 *  What a synchronisation had to abandon, for the account menu to tell the user about.
 *
 *  The records here are on their way out. A push that was refused anything leaves the baseline
 *  alone and lets the next pull replace the profile with what the account holds, which is
 *  everything except these - so this notice is the only trace they will leave, and the user
 *  made them. Whether that pull has run yet when a subscriber hears of it depends on what
 *  started the push, so nothing worded from this may claim they are already gone.
 *
 *  `sequence` is not decoration. `ObservableValue` compares deeply and drops a value equal to
 *  the one before it, so two separate refusals describing the same record would be published
 *  once and the second would be silent.
 */
/**
 *  Local workspaces a merge by name kept apart, because joining them would have gone over a
 *  Fair Use cap. `sequence` keeps two notices from being deep-equal, as above.
 */
export interface HeldApartNotice {
    sequence: number;
    names: string[];
}

/** A change set ready to send, and the scope it was decided in. */
interface PreparedPush {
    operations: SyncOperation[];
    withheld: SyncOperation[];
    /** This device's state within the scope: the baseline once the account confirms it. */
    scopedCurrent: SyncBaseline;
    inProfile: InScope;
    inWorkspace: InScope;
}

/** What the coordinator needs from the account's standing. */
export interface StandingSource {
    /** The limits in force and whether the account is premium, as last known. */
    rules(): SlotRules;
    /** Takes the standing a snapshot carried. */
    adopt(userId: string, premium: boolean, limits: unknown): Promise<void>;
    /** Asks the account for its standing again, now. */
    recheck(): Promise<void>;
}

/** The shared standing, as the repositories read it. */
const SHARED_STANDING: StandingSource = {
    rules: () => ({ limits: planLimits$.get(), premium: premiumStanding$.get() }),
    adopt: (userId, premium, limits) => accountStandingRepository.adopt(userId, premium, limits),
    recheck: () => accountStandingRepository.recheck()
};

export interface SyncRejectionNotice {

    /** Counts notices, so that no two are ever deep-equal. */
    sequence: number;

    /** What the account refused, as it described it. */
    records: SyncRejectedOperation[];
}

/**
 *  Keeps this device and the account in step.
 *
 *  Three things start a synchronisation, and they are the three from TODOS.md: opening a new
 *  tab, changing something here, and being told over the websocket that something changed
 *  somewhere else. All of them end in the same two steps, in this order:
 *
 *  1. **push** what this device has that the account does not, and only then
 *  2. **pull** the account's state and take it as authoritative.
 *
 *  The order is the whole safety argument. A pull replaces a profile wholesale, so pulling
 *  first would quietly discard anything typed while offline. Pushing first means those
 *  changes are on the server before the server's answer is believed, and the pull that
 *  follows returns them.
 *
 *  **Deletions need no tombstones.** A pull replaces a profile entirely, so a record the
 *  account no longer has simply is not in what arrives, and a record this device no longer
 *  has is absent from the difference and so is deleted on the server. Nothing has to remember
 *  that a thing once existed.
 *
 *  **Nothing here blocks the user.** Every failure to reach the server leaves the baseline
 *  untouched, which means the same work is computed again next time. Being offline is a
 *  normal state, not an error, and is never reported as one.
 *
 *  It runs in the page rather than the service worker: MV3 stops an idle worker after thirty
 *  seconds, and local changes only ever originate from a new tab page anyway.
 */
export class SyncCoordinator {

    private LOG: Logger = new Logger("SyncCoordinator");

    private readonly appState: AppStateRepository;
    private readonly profiles: ProfileRepository;
    private readonly sessions: SessionRepository;
    private readonly baselines: SyncBaselineRepository;
    private readonly apiClient: BackendApiClient;
    private readonly channel: RefreshChannel;

    /** True between signing in and signing out; nothing synchronises while false. */
    private running: boolean = false;

    /** True while a snapshot is being written locally, so it is not pushed straight back. */
    private applyingRemoteState: boolean = false;

    /** Serialises synchronisations, so two triggers cannot interleave push and pull. */
    private inFlight: Promise<void> = Promise.resolve();

    private pushTimer: number | null = null;
    private pullTimer: number | null = null;

    /** What the account menu may show about synchronisation. */
    public readonly activity$ = new ObservableValue<SyncActivity>("idle");

    /**
     *  The last thing the account refused, for whoever is in a position to tell the user.
     *
     *  Null until something is, and it is never cleared back to null: a notice that vanished
     *  on the next clean synchronisation would be a notice the user could miss by not looking.
     */
    public readonly rejections$ = new ObservableValue<SyncRejectionNotice | null>(null);

    /** How many notices have been published, which is what keeps them distinguishable. */
    private rejectionNoticesIssued: number = 0;

    /**
     *  What the last notice was about, so that the same trouble is not announced twice.
     *
     *  A refused record stays in local state until a pull takes it away, and every local
     *  change in between offers it to the account again. Without this the user is told the
     *  same thing on every debounced push.
     */
    private rejectionAlreadyReported: string | null = null;

    /**
     *  The limit the account last refused this device's changes over, or null: a fair use
     *  limit, or - on a free account - the free plan's.
     *
     *  Set while it stands: the account refused the whole push (HTTP 409,
     *  `FAIR_USE_LIMIT_REACHED` or `FREE_PLAN_LIMIT_REACHED`, handled alike) and nothing in it
     *  was applied. Cleared by the next push the
     *  account takes, and by signing out. The account menu says it in place of "Synchronised",
     *  in the words a local refusal uses.
     */
    public readonly limitRefusal$ = new ObservableValue<LimitRefusal | null>(null);

    /**
     *  The change set the account refused over a limit, so it is not sent again.
     *
     *  Sending the same operations again cannot succeed - the account has not changed, and
     *  neither has what was offered - so a push computing exactly this is skipped without a
     *  request. Two things make another attempt worth it, and both clear this: a local change
     *  that alters what would be sent (deleting links to make room), and anything that runs a
     *  push-then-pull - opening a page, a change notification from another device - since the
     *  account may have made room meanwhile. Neither repeats on its own, so a refusal can
     *  never become a retry loop.
     */
    private limitRefusedChangeSet: string | null = null;

    /** Where a refusal the user should hear about at once is published; see push(). */
    private readonly fairUseNotices: FairUseRefusals = fairUseRefusals;

    /**
     *  What synchronises on this device and why the rest does not, after the last cycle that
     *  could tell (`SyncSlots.ts`). Null until one has, and while signed out. The profiles menu,
     *  the profile manager and the workspace head draw their unsynchronised marks from it.
     */
    public readonly scope$ = new ObservableValue<PublishedSyncScope | null>(null);

    /** Local workspaces a merge by name kept apart over a Fair Use cap, for the page to say. */
    public readonly heldApart$ = new ObservableValue<HeldApartNotice | null>(null);
    private heldApartIssued: number = 0;
    private heldApartAlreadyReported: string | null = null;

    /** The account's profiles and workspaces as last read: what slots are decided against. */
    private accountInventory: AccountInventory | null = null;

    /**
     *  Counts synchronisation runs, and which run last read the account's lists. Lists read in
     *  the run that pushes are current; lists from an earlier run only tell whether there is
     *  anything to push at all.
     */
    private cycle: number = 0;
    private inventoryCycle: number = -1;

    /**
     *  Identifiers the server stored under another one since the last pull. The pull drops this
     *  device's copy under the old identifier, which it would otherwise keep as local only.
     */
    private remappedIds = new Set<string>();

    private readonly standing: StandingSource;
    private readonly inventoryReporter: InventoryReporter;

    constructor(
        appState: AppStateRepository = appStateRepository,
        profiles: ProfileRepository = profileRepository,
        sessions: SessionRepository = sessionRepository,
        baselines: SyncBaselineRepository = syncBaselineRepository,
        apiClient: BackendApiClient = backendApiClient,
        standing: StandingSource = SHARED_STANDING
    ) {
        this.appState = appState;
        this.profiles = profiles;
        this.sessions = sessions;
        this.baselines = baselines;
        this.apiClient = apiClient;
        this.standing = standing;
        this.inventoryReporter = new InventoryReporter(apiClient);
        this.channel = new RefreshChannel(
            () => this.sessions.getSession()?.accessToken ?? null);
    }

    /**
     *  Starts watching for everything that should cause a synchronisation.
     *
     *  Awaited during start-up, so that a device which is already signed in has pulled before
     *  the page settles, which is the "check when the browser is first opened" of TODOS.md.
     */
    public async start(): Promise<void> {

        await this.baselines.init();

        this.channel.onRefresh(notification => {
            if (notification.origin === installationIdentity.getInstallationId()) {
                // The echo of this device's own push. Pulling here would be a pointless round
                // trip that re-fetches what this device has just sent.
                return;
            }
            this.LOG.debug("onRefresh", "The account changed elsewhere");
            this.schedulePull();
        });

        // Notifications are not replayed. While the channel was down - a backend pod replaced
        // during a deploy, the laptop asleep - whatever the account announced reached nobody,
        // so coming back is itself the reason to look.
        this.channel.onReconnected(() => {
            this.LOG.debug("onReconnected", "Refresh channel is back; pulling what it may have missed");
            this.schedulePull();
        });

        this.appState.persisted$.subscribe(() => this.onLocalChange());
        this.profiles.profiles$.subscribe(() => this.onLocalChange());

        // Subscribing fires immediately with the current session, so this both reacts to a
        // sign-in later and starts synchronising a device that is already signed in.
        this.sessions.session$.subscribe(session => {
            void this.onSessionChanged(session);
        });
    }

    /** Pushes and pulls right now, whatever the timers were about to do. */
    public synchronizeNow(): Promise<void> {
        return this.enqueue(() => this.pushThenPull());
    }

    // ---------------------------------------------------------------- lifecycle

    private async onSessionChanged(session: SyncSession | null): Promise<void> {

        if (session && !this.running) {
            this.running = true;
            this.LOG.log("onSessionChanged", `Synchronising account ${session.username}`);
            await this.enqueue(async () => {
                await this.showProfilesOf(session);
                await this.beginForAccount(session);
            });
            return;
        }

        if (!session && this.running) {
            this.running = false;
            this.LOG.log("onSessionChanged", "Signed out; synchronisation stopped");
            this.cancelTimers();
            this.channel.disconnect();
            this.clearLimitRefusal();
            this.accountInventory = null;
            this.scope$.set(null);
            // Everything stays: the profiles remain visible and remain the account's, and so
            // does its baseline. Whatever is done to them while signed out is the difference
            // the next sign-in of the same account pushes - deletions included, which a fresh
            // first contact would never push.
        }
    }

    /**
     *  Makes the signing-in account's profiles the visible ones, when they are not already.
     *
     *  Local data belongs to the account it was synchronised with. Another account's profiles
     *  are never merged into this one: they are hidden, untouched, and come back when their
     *  owner signs in again. Profiles that belong to no account - a device that has never
     *  synchronised - are left visible for first contact to merge, as before.
     *
     *  The registry is read from storage under a lock rather than trusted from memory, because
     *  every open new tab page reacts to the sign-in and only one of them may make the swap.
     */
    private async showProfilesOf(session: SyncSession): Promise<void> {
        const signingIn = { accountId: session.userId, username: session.username };

        const swapped = await withExclusiveLock(ACCOUNT_TRANSITION_LOCK, async () => {
            await this.profiles.reload();
            const owner = this.profiles.getOwner();

            if (!owner) {
                // Synchronised with this account before ownership was recorded: its baseline
                // says so, and those profiles are this account's.
                if (this.baselines.getFor(session.userId)) {
                    await this.profiles.claimFor(signingIn);
                }
                return false;
            }
            if (owner.accountId === session.userId) {
                return false;
            }
            this.LOG.log("showProfilesOf",
                `Hiding ${owner.username}'s profiles; showing ${session.username}'s`);
            await this.profiles.showAccount(signingIn);
            return true;
        });

        if (swapped) {
            await this.reloadActiveProfile();
        }
    }

    /**
     *  Whether the visible profiles may be synchronised with this account: they are its own, or
     *  nobody's yet. The last line of defence against another account's links reaching this one,
     *  whatever path led here.
     */
    private visibleProfilesBelongTo(session: SyncSession): boolean {
        const owner = this.profiles.getOwner();
        return owner === null || owner.accountId === session.userId;
    }

    /**
     *  Brings a freshly signed-in device into step with its account.
     *
     *  A device that has never synchronised this account merges rather than replaces - that
     *  is the case where both ends already hold links and neither may be thrown away.
     */
    private async beginForAccount(session: SyncSession): Promise<void> {

        await this.makeLocalIdentifiersStorable();

        if (this.baselines.getFor(session.userId) === null || this.profiles.isAwaitingAccount()) {
            await this.mergeWithAccount(session);
        } else {
            await this.pushThenPull();
        }
        this.channel.connect();
    }

    // -------------------------------------------------------------- first contact

    /**
     *  Joins what this device holds to what the account holds, without losing either.
     *
     *  Profiles pair up by name, because that is the only thing two devices that have never
     *  met can agree on: two fresh installs both call their first profile "Default" and mean
     *  the same thing by it. A paired profile adopts the account's identifier, so that every
     *  device ends up naming it the same way, and its contents go through the merge rules.
     */
    private async mergeWithAccount(session: SyncSession): Promise<void> {

        if (!this.visibleProfilesBelongTo(session)) {
            this.LOG.warn("mergeWithAccount", "Visible profiles belong to another account; not merging");
            return;
        }

        const snapshot = await this.fetchSnapshot();
        if (!snapshot) {
            // Cannot merge without knowing what the account holds. Nothing is pushed, because
            // pushing before merging would duplicate everything the account already has.
            this.LOG.warn("mergeWithAccount", "Account unreachable; merge deferred");
            return;
        }

        // Only what holds a slot is merged into or downloaded. The account's other profiles
        // and workspaces stay where they are: not shown here, not written, not counted as
        // deletions - this device simply never had them.
        this.accountInventory = inventoryFromSnapshot(snapshot);
        this.inventoryCycle = this.cycle;
        const holders = slotHolders(this.accountInventory, this.standing.rules().limits);
        const slotProfileIds = new Set(holders.profiles.map(profile => profile.id));
        const slotWorkspaceIds = new Set(
            [...holders.workspacesByProfile.values()].flat().map(workspace => workspace.id));
        const slotProfiles = snapshot.profiles.filter(profile => slotProfileIds.has(profile.id));

        const candidatesByName = this.groupRemoteProfilesByName(slotProfiles);
        const unpairedRemoteProfiles = new Map(
            slotProfiles.map(profile => [profile.id, profile]));

        // Identity settles what it can before any name is compared, and for every profile at
        // once rather than one at a time. A profile the account holds under the same
        // identifier is that profile whatever either end calls it - and doing this in the loop
        // below would leave the outcome to the order the profiles happen to come in, where a
        // differently named profile could be claimed by name by whichever local profile was
        // considered first.
        const pairedByIdentity = this.pairProfilesByIdentity(unpairedRemoteProfiles);
        // The account's own profile without a slot: this device's copy stays as it is.
        const heldWithoutSlot = new Set(snapshot.profiles
            .filter(profile => !slotProfileIds.has(profile.id))
            .map(profile => profile.id));

        // A placeholder that stood in for this account's profiles is set aside, not merged: an
        // empty "Default" the account has no counterpart for would otherwise be pushed to it.
        const placeholders = await this.emptyPlaceholdersToReplace(snapshot);
        const heldApart: string[] = [];

        for (const local of this.profiles.getProfiles()
            .filter(profile => !placeholders.has(profile.id) && !heldWithoutSlot.has(profile.id))) {
            const remote = pairedByIdentity.get(local.id)
                ?? this.takeRemoteCounterpart(candidatesByName, unpairedRemoteProfiles, local);

            if (!remote) {
                continue;   // The account has never seen it; the push below creates it if it fits.
            }
            heldApart.push(...await this.mergeOneProfile(local, remote, snapshot, slotWorkspaceIds));
        }

        // Whatever is left is a profile this device has never had; take it as it stands -
        // its workspaces that hold a slot.
        // Every remote profile leaves this loop present locally, which is what makes the push
        // below incapable of reading the account's own profiles as deletions.
        for (const remote of unpairedRemoteProfiles.values()) {
            await this.profiles.upsertProfile(remote);
            // A profile this device has never held: nothing of its own to join.
            if (snapshot.closedTabsSupported) {
                await writeClosedTabs(
                    remote.id, snapshot.closedTabsByProfileId[remote.id] ?? {});
            }
            if (snapshot.visitsSupported) {
                await writeVisits(remote.id, snapshot.visitsByProfileId[remote.id] ?? {});
            }
            await this.appState.saveProfileData(
                remote.id,
                // Through withLocalWorkspaceChoice, exactly as applySnapshot writes a profile.
                // A mapped snapshot names no open workspace - that choice is per-device and
                // never synchronised, so every profile arrives with activeEnvironmentId null -
                // and this device has no previous choice for a profile it has never held. What
                // it needs is the first workspace, not none: a profile stored with workspaces
                // but naming none open reports itself as empty, which sends the page to the
                // first-run screen and, before this was fixed, into a reload loop.
                await this.withLocalWorkspaceChoice(
                    remote.id,
                    dataWithin(snapshot.dataByProfileId[remote.id]
                        ?? SyncSnapshotMapper.emptyProfileData(), id => slotWorkspaceIds.has(id))));
        }

        // Only now, with the account's profiles in place, so that the set is never empty.
        for (const placeholderId of placeholders) {
            await this.profiles.removeProfile(placeholderId);
            await this.appState.discardProfileData(placeholderId);
        }

        // The baseline is what the account holds within the slots - not what this device now
        // holds, so the push that follows carries exactly the local additions the merge kept,
        // and not what it never received, so that can never be read as a deletion.
        await this.baselines.store(session.userId, restrictToScope({
            profiles: snapshot.profiles,
            dataByProfileId: snapshot.dataByProfileId,
            closedTabsByProfileId: snapshot.closedTabsByProfileId,
            closedTabsSupported: snapshot.closedTabsSupported,
            visitsByProfileId: snapshot.visitsByProfileId,
            visitsSupported: snapshot.visitsSupported
        }, id => slotProfileIds.has(id), id => slotWorkspaceIds.has(id)));

        // From here the visible profiles are this account's.
        await this.profiles.markAccountArrived();
        await this.profiles.claimFor({ accountId: session.userId, username: session.username });

        await this.reloadActiveProfile();
        this.announceHeldApart(heldApart);
        await this.push(FIRST_CONTACT);
    }

    /**
     *  Collects the account's profiles under the name they pair by, keeping every one.
     *
     *  Building a Map straight from the snapshot looked equivalent and was not: duplicate
     *  keys overwrite, so an account holding more than one profile called "Default" kept only
     *  the last of them here. The others were then neither merged into nor copied down, while
     *  the baseline still listed them - and a baseline record with no local counterpart is
     *  exactly what the change set sends as a deletion. That is how a second device could
     *  delete the first device's profile outright.
     *
     *  @param profiles the account's profiles, in the order the snapshot gave them
     *  @return the profiles of each name, in that same order
     */
    private groupRemoteProfilesByName(profiles: ProfileMeta[]): Map<string, ProfileMeta[]> {

        const byName = new Map<string, ProfileMeta[]>();

        for (const profile of profiles) {
            const sameName = byName.get(this.asName(profile.name));
            if (sameName) {
                sameName.push(profile);
            } else {
                byName.set(this.asName(profile.name), [profile]);
            }
        }
        return byName;
    }

    /**
     *  Pairs off every profile the account holds under an identifier this device also has.
     *
     *  Those are the same profile seen from two sides, however differently the two ends name
     *  it, which is the case a device that synchronised once and then signed out is entirely
     *  made of: it kept the account's identifiers when its baseline was cleared. Claimed
     *  profiles are removed from `unpaired`, so nothing can afterwards take one by name.
     *
     *  @param unpaired every account profile not yet claimed, keyed by identifier; mutated
     *  @return local identifier -> the account's profile it is the same profile as
     */
    private pairProfilesByIdentity(
        unpaired: Map<string, ProfileMeta>
    ): Map<string, ProfileMeta> {

        const paired = new Map<string, ProfileMeta>();

        for (const local of this.profiles.getProfiles()) {
            const sameIdentifier = unpaired.get(local.id);
            if (sameIdentifier) {
                unpaired.delete(local.id);
                paired.set(local.id, sameIdentifier);
            }
        }
        return paired;
    }

    /**
     *  Claims the account's profile a local one should merge into, or nothing.
     *
     *  Only profiles the account has never heard of get this far - identity has already
     *  settled the rest - so the name is all there is to go on, which is what two devices
     *  that have never met can agree on. Where several profiles share a name they are claimed
     *  in snapshot order, which is the account's own display order, so the oldest is paired
     *  first and a device with two profiles of one name pairs each of them exactly once.
     *
     *  @param candidatesByName the account's profiles grouped by name; claimed ones are removed
     *  @param unpaired         every account profile not yet claimed, keyed by identifier
     *  @param local            the profile on this device looking for a counterpart
     *  @return the counterpart, or null when the account has no unclaimed profile of that name
     */
    private takeRemoteCounterpart(
        candidatesByName: Map<string, ProfileMeta[]>,
        unpaired: Map<string, ProfileMeta>,
        local: ProfileMeta
    ): ProfileMeta | null {

        const candidates = candidatesByName.get(this.asName(local.name)) ?? [];

        while (candidates.length > 0) {
            const candidate = candidates.shift()!;
            if (unpaired.delete(candidate.id)) {
                return candidate;
            }
        }
        return null;
    }

    /**
     *  Merges one local profile into its counterpart on the account - into the workspaces of
     *  it that hold a slot, and only as far as the Fair Use caps allow (`mergeWithinCaps`).
     *
     *  @return the names of local workspaces kept apart because merging them would have gone
     *          over a cap
     */
    private async mergeOneProfile(
        local: ProfileMeta,
        remote: ProfileMeta,
        snapshot: MappedSnapshot,
        slotWorkspaceIds: ReadonlySet<string>
    ): Promise<string[]> {

        const localData = await this.readProfileData(local.id);
        const merged = mergeWithinCaps(
            localData ?? SyncSnapshotMapper.emptyProfileData(),
            dataWithin(snapshot.dataByProfileId[remote.id] ?? SyncSnapshotMapper.emptyProfileData(),
                id => slotWorkspaceIds.has(id)),
            this.standing.rules().limits);

        await this.profiles.upsertProfile(remote);
        await this.appState.saveProfileData(remote.id, merged.merged);

        // Closed tabs are joined rather than merged by the engine above: they are a log of
        // things that happened on two machines, and neither list is more right than the
        // other. Both are kept, and the same address closed on both devices is one entry -
        // see mergeClosedTabs.
        //
        // An account that does not keep them has no half to contribute, and this device's own
        // list is carried over unchanged. It still has to be *carried*: the identifier below
        // may be about to change, and a list left behind under the old one is a list deleted.
        await writeClosedTabs(remote.id, snapshot.closedTabsSupported
            ? mergeClosedTabs(
                await readClosedTabs(local.id),
                snapshot.closedTabsByProfileId[remote.id] ?? {})
            : await readClosedTabs(local.id));
        // Browsing history is a log too, joined by the same rule.
        await writeVisits(remote.id, snapshot.visitsSupported
            ? mergeVisits(await readVisits(local.id), snapshot.visitsByProfileId[remote.id] ?? {})
            : await readVisits(local.id));

        if (local.id !== remote.id) {
            await this.dropMergedProfile(local.id, remote.id);
        }
        return merged.heldApart.map(workspace => workspace.name);
    }

    /**
     *  Forgets a local profile that has just been merged into another under the identifier
     *  that survives, moving the page onto the survivor if it was showing the one that goes.
     *
     *  @param mergedId   the profile merged away
     *  @param survivorId the profile it was merged into
     */
    private async dropMergedProfile(mergedId: string, survivorId: string): Promise<void> {
        // The pair are the same profile under two names for it. The surviving identifier
        // wins, so this device drops its own and everything it stored under it - the data
        // has just been written under the identifier that survives.
        const wasActive = this.appState.getActiveProfileId() === mergedId;

        await this.profiles.removeProfile(mergedId);
        await this.appState.discardProfileData(mergedId);
        // Safe because the list has just been written under the identifier that survives.
        await writeClosedTabs(mergedId, {});
        await writeVisits(mergedId, {});

        if (wasActive) {
            await this.profiles.setActiveProfile(survivorId);
            await this.appState.switchProfile(survivorId);
        }
    }

    /**
     *  First contact by name, for what is still at first contact on a device that is already
     *  synchronising: a local-only profile or workspace renamed to the name of the account's
     *  is merged into it now, as it would have been at sign-in.
     *
     *  Only items that have never been synchronised qualify - not on the account and not in
     *  the baseline - and of those only what is local only for lack of a slot or over a cap.
     *  Something new that fits a free slot synchronises as a new item even when it shares a
     *  name, rather than being swallowed into the existing one. A rename of something
     *  synchronised stays a rename. Only slot-holders are merged into.
     *
     *  @param account  the account's lists
     *  @param baseline what this device last confirmed with the account
     */
    private async adoptNameMatches(account: AccountInventory, baseline: SyncBaseline): Promise<void> {
        const { limits } = this.standing.rules();
        const holders = slotHolders(account, limits);
        const onAccount = new Set([
            ...account.profiles.map(profile => profile.id),
            ...account.workspaces.map(workspace => workspace.id)
        ]);
        const confirmed = (profileId: string): Set<string> =>
            new Set(Object.keys(baseline.dataByProfileId[profileId]?.environments ?? {}));
        const confirmedProfiles = new Set(baseline.profiles.map(profile => profile.id));
        const heldApart: string[] = [];
        let changed = false;
        const localOnly = (decided: { state: string } | undefined): boolean =>
            decided?.state === "LOCAL_ONLY_FREE_LIMIT" || decided?.state === "LOCAL_ONLY_FAIR_USE";
        const scopeNow = async () => decideSyncScope(
            account, this.localProfilesOf(await this.readEverythingLocally()), this.standing.rules());

        // Profiles first: a merged profile brings its workspaces along.
        const profileScope = await scopeNow();
        for (const local of this.profiles.getProfiles()) {
            if (onAccount.has(local.id) || confirmedProfiles.has(local.id) || !localOnly(profileScope.profiles[local.id])) {
                continue;
            }
            const data = await this.readProfileData(local.id);
            if (isExampleProfile(local, data)) {
                continue;
            }
            const counterpart = holders.profiles.find(holder => holder.id !== local.id
                && asName(holder.name) === asName(local.name)
                && this.profiles.getProfiles().some(profile => profile.id === holder.id));
            if (!counterpart) {
                continue;
            }
            this.LOG.log("adoptNameMatches", `Merging local profile ${local.name} into the account's`);
            const merged = mergeWithinCaps(
                data ?? SyncSnapshotMapper.emptyProfileData(),
                await this.readProfileData(counterpart.id) ?? SyncSnapshotMapper.emptyProfileData(),
                limits);
            await this.appState.saveProfileData(counterpart.id, merged.merged);
            await writeClosedTabs(counterpart.id, mergeClosedTabs(
                await readClosedTabs(local.id), await readClosedTabs(counterpart.id)));
            await writeVisits(counterpart.id, mergeVisits(
                await readVisits(local.id), await readVisits(counterpart.id)));
            await this.dropMergedProfile(local.id, counterpart.id);
            heldApart.push(...merged.heldApart.map(workspace => workspace.name));
            changed = true;
        }

        // Then workspaces, within each slot-holding profile.
        const workspaceScope = await scopeNow();
        for (const holder of holders.profiles) {
            const data = await this.readProfileData(holder.id);
            if (!data) {
                continue;
            }
            const slotWorkspaces = (holders.workspacesByProfile.get(holder.id) ?? [])
                .filter(workspace => workspace.id in data.environments);
            const confirmedHere = confirmed(holder.id);
            const candidates = Object.values(data.environments).filter(workspace =>
                !onAccount.has(workspace.id) && !confirmedHere.has(workspace.id) && !isExampleWorkspace(workspace)
                && localOnly(workspaceScope.workspaces[workspace.id])
                && slotWorkspaces.some(slot => slot.id !== workspace.id && asName(slot.name) === asName(workspace.name)));
            if (candidates.length === 0) {
                continue;
            }
            const candidateIds = new Set(candidates.map(workspace => workspace.id));
            // The open workspace goes in with the candidates, so that one merged away leaves the
            // page on the workspace it was merged into.
            const merged = mergeWithinCaps(
                joinSlices(candidates.map(workspace => workspaceSlice(data, workspace.id)), data.activeEnvironmentId),
                dataWithin(data, id => !candidateIds.has(id)),
                limits);
            if (merged.heldApart.length < candidates.length) {
                this.LOG.log("adoptNameMatches", `Merged ${candidates.length - merged.heldApart.length} workspace(s) by name`);
                await this.appState.saveProfileData(holder.id, merged.merged);
                changed = true;
            }
            heldApart.push(...merged.heldApart.map(workspace => workspace.name));
        }

        if (changed) {
            await this.reloadActiveProfile();
        }
        this.announceHeldApart(heldApart);
    }

    /**
     *  Publishes the workspaces a merge kept apart over a Fair Use cap, once per distinct set.
     *
     *  @param names the workspaces' names; nothing is published when empty
     */
    private announceHeldApart(names: string[]): void {
        if (names.length === 0) {
            return;
        }
        const signature = [...names].sort().join("|");
        if (signature === this.heldApartAlreadyReported) {
            return;
        }
        this.heldApartAlreadyReported = signature;
        this.heldApartIssued += 1;
        this.heldApart$.set({ sequence: this.heldApartIssued, names });
    }

    // ------------------------------------------------------------- steady state

    private async pushThenPull(): Promise<void> {
        // Whatever caused this may have made room on the account, so a change set refused
        // over a limit is offered once more.
        this.limitRefusedChangeSet = null;
        await this.push();
        if (this.limitRefusal$.get()) {
            // A pull replaces local data with the account's, and the account holds none of
            // what it just refused. Pulling would delete it from this device - the one thing a
            // limit must never do. Stay as we are until a push is taken.
            this.LOG.warn("pushThenPull", "Account refused over a limit; not pulling");
            await this.reportInventory();
            return;
        }
        await this.pull();
        await this.reportInventory();
    }

    /**
     *  Sends everything the account is missing.
     *
     *  The baseline only moves on once the server has confirmed the batch, so a failure here
     *  costs nothing but time: the same difference is computed again next time.
     *
     *  @param occasion why this push is happening, which decides whether it may delete
     *  @param afterLocalChange true when something the user just did caused it, which is when
     *         a fair use refusal is worth a notice rather than only the account menu's status
     */
    private async push(
        occasion: PushOccasion = "steady-state",
        afterLocalChange: boolean = false
    ): Promise<void> {

        const session = this.sessions.getSession();
        if (!session) {
            return;
        }

        if (!this.visibleProfilesBelongTo(session)) {
            this.LOG.warn("push", "Visible profiles belong to another account; not pushing");
            return;
        }

        await this.emptyClosedTabsNotRecorded();
        await this.emptyHistoryNotRecorded();

        const baseline = this.baselines.getFor(session.userId);
        if (!baseline || this.profiles.isAwaitingAccount()) {
            // This device has never synchronised this account, which normally means the merge
            // at sign-in could not reach the server. Retry it here rather than waiting for a
            // reload, and stop: merging ends by pushing anyway. Pushing without having merged
            // would duplicate everything the account already holds.
            await this.mergeWithAccount(session);
            return;
        }

        // Slots are decided against the account's lists. Lists read in this run are current.
        // A copy from an earlier run is good enough to find out whether there is anything to
        // say at all - most local changes are to something already synchronised - and a push
        // that does say something reads them again first.
        let account: AccountInventory | null = null;
        if (this.accountInventory && this.inventoryCycle === this.cycle) {
            account = this.accountInventory;
        } else if (this.accountInventory) {
            await this.adoptNameMatches(this.accountInventory, baseline);
            const quick = await this.prepareChangeSet(this.accountInventory, baseline, occasion);
            if (quick.operations.length === 0) {
                this.nothingToPush();
                await this.recoverFromWithheldDeletions(quick.withheld);
                return;
            }
        }

        for (let attempt = 0; attempt < 2; attempt++) {
            account = account ?? await this.readAccountInventory();
            if (!account) {
                return;
            }
            await this.adoptNameMatches(account, baseline);
            const prepared = await this.prepareChangeSet(account, baseline, occasion);

            if (prepared.operations.length === 0) {
                this.nothingToPush();
                await this.recoverFromWithheldDeletions(prepared.withheld);
                return;
            }

            const outcome = await this.send(session, baseline, prepared, afterLocalChange, attempt === 0);
            if (outcome !== "retry") {
                return;
            }
            // Another device took the last free slot at the same moment. The lists are read
            // again and what lost is left out; a second refusal stands, so this cannot loop.
            this.LOG.warn("push", "Refused over a limit; re-reading the account's lists once");
            account = null;
        }
    }

    /** Nothing to send means nothing refused stands any more. */
    private nothingToPush(): void {
        this.clearLimitRefusal();
        this.activity$.set("idle");
    }

    /** A change set worked out against the slots, with what it was worked out from. */
    private async prepareChangeSet(
        account: AccountInventory,
        baseline: SyncBaseline,
        occasion: PushOccasion
    ): Promise<PreparedPush> {
        const current = await this.readEverythingLocally();
        const scope = decideSyncScope(account, this.localProfilesOf(current), this.standing.rules());
        this.publishScope(scope);

        const inProfile: InScope = id => profileInScope(scope, id);
        const inWorkspace: InScope = id => workspaceInScope(scope, id);
        const scopedCurrent = restrictToScope(current, inProfile, inWorkspace);
        const everything = ChangeSetBuilder.build(
            restrictToScope(baseline, inProfile, inWorkspace),
            scopedCurrent.profiles, scopedCurrent.dataByProfileId,
            scopedCurrent.closedTabsByProfileId ?? {},
            scopedCurrent.visitsByProfileId ?? {});

        const withheld = occasion === FIRST_CONTACT
            ? everything.filter(operation => operation.op === "delete")
            : [];
        if (withheld.length > 0) {
            // A merge is supposed to leave this device holding everything the account holds,
            // so a deletion here means the merge dropped something and the difference is
            // describing that mistake rather than the user's intent. Sending it would destroy
            // data this device has never shown anyone. The pull that follows repairs it.
            this.LOG.error("push",
                `Withheld ${withheld.length} deletions computed at first contact`);
        }
        return {
            scopedCurrent, inProfile, inWorkspace, withheld,
            operations: withheld.length > 0
                ? everything.filter(operation => operation.op !== "delete")
                : everything
        };
    }

    /**
     *  Sends a prepared change set and deals with the answer.
     *
     *  @param mayRetry whether a refusal over a limit should be answered by one more attempt
     *  @return "retry" when the account refused over a limit and one more attempt is due
     */
    private async send(
        session: SyncSession,
        baseline: SyncBaseline,
        prepared: PreparedPush,
        afterLocalChange: boolean,
        mayRetry: boolean
    ): Promise<"done" | "retry"> {
        const { operations, withheld } = prepared;

        const changeSet = JSON.stringify(operations);
        if (changeSet === this.limitRefusedChangeSet) {
            this.LOG.debug("push", "Same change set the account refused over a limit; not resending");
            return "done";
        }

        this.LOG.debug("push", `Sending ${operations.length} operations`);
        this.activity$.set("working");

        const result = await this.apiClient.pushChanges({
            originDeviceId: installationIdentity.getInstallationId(),
            operations
        });

        if (result.outcome === "rejected" && result.limitRefusal) {
            if (mayRetry) {
                // The lists this push was decided against are stale; so may the limits be.
                this.accountInventory = null;
                await this.standing.recheck();
                return "retry";
            }
            // Nothing in the batch was applied, and nothing is taken away here: the baseline
            // stays, local data stays, and pushThenPull will not pull over it.
            const standing = this.limitRefusal$.get();
            const alreadyStanding = standing !== null
                && standing.limit === result.limitRefusal.limit
                && standing.kind === result.limitRefusal.kind;
            this.limitRefusedChangeSet = changeSet;
            this.limitRefusal$.set(result.limitRefusal);
            if (afterLocalChange && !alreadyStanding) {
                // Only for what the user just did: a page opening and finding the refusal
                // still standing says so in the menu, not in a notice on every new tab.
                this.fairUseNotices.reportRefusal(result.limitRefusal);
            }
            this.activity$.set("idle");
            this.LOG.warn("push", `Refused over the ${result.limitRefusal.kind} limit ${result.limitRefusal.limit}`);
            return "done";
        }

        if (result.outcome !== "success") {
            this.activity$.set(result.outcome === "offline" ? "offline" : "idle");
            this.LOG.warn("push", `Not applied: ${result.message}`);
            return "done";
        }

        // The account took this push, so no limit's refusal stands any more.
        this.clearLimitRefusal();
        // What was just created holds its slot now; the lists are read again before deciding.
        this.accountInventory = null;
        for (const remap of result.data.remaps) {
            this.remappedIds.add(remap.clientId);
        }

        if (result.data.rejected.length > 0) {
            // Said before the pull below. A refused workspace or profile stays on this device
            // as local only - the pull no longer deletes what the account does not hold unless
            // the account once held it - but a refused record inside a synchronised workspace
            // is still replaced by the account's copy of that workspace.
            this.announceRejections(result.data.rejected);
        }

        if (result.data.remaps.length > 0 || result.data.rejected.length > 0) {
            // The server stored something under an identifier of its own, or refused an
            // operation. Either way this device's picture is now wrong in a way a difference
            // cannot express, so the following pull is left to correct it.
            this.LOG.warn("push",
                `${result.data.remaps.length} remapped, ${result.data.rejected.length} refused`);
            return "done";
        }

        // Nothing was refused, so whatever was announced last time is over and a refusal
        // after this one is news again.
        this.rejectionAlreadyReported = null;

        if (withheld.length > 0) {
            // The baseline must not record a state the account is not in: the records those
            // deletions named are still on the server and are still missing here.
            await this.recoverFromWithheldDeletions(withheld);
            return "done";
        }

        await this.baselines.store(session.userId, baselineAfter(
            baseline, prepared.scopedCurrent, prepared.inProfile, prepared.inWorkspace));
        this.activity$.set("idle");
        return "done";
    }

    /** The account took a push, or there was nothing to push: no limit's refusal stands. */
    private clearLimitRefusal(): void {
        this.limitRefusedChangeSet = null;
        this.limitRefusal$.set(null);
    }

    /**
     *  Publishes what the account refused, so that somebody can tell the user.
     *
     *  It only publishes. Wording, translating and choosing how to interrupt belong to the
     *  view model that subscribes - this is the synchronisation layer, and it has no business
     *  knowing what language the page is in.
     *
     *  **Only refusals, never remaps.** A remapped identifier is not a loss: the record is on
     *  the account under a name the server chose and the pull brings it straight back.
     *  Reporting that would train the user to dismiss the notice that does mean something.
     *
     *  The same trouble is announced once. A refused record stays in local state until a pull
     *  takes it away, and every local change before that offers it to the account again - so
     *  without the memory below a single vanished workspace is reported on every debounced
     *  push for as long as the tab is open.
     *
     *  @param records what the account refused, as it described it
     */
    private announceRejections(records: SyncRejectedOperation[]): void {

        const signature = records
            .map(record => `${record.type}:${record.id}:${record.reason}`)
            .sort()
            .join("|");

        if (signature === this.rejectionAlreadyReported) {
            this.LOG.debug("announceRejections", "Already said; not repeating");
            return;
        }
        this.rejectionAlreadyReported = signature;
        this.rejectionNoticesIssued += 1;

        this.LOG.warn("announceRejections",
            `Telling the user about ${records.length} refused record(s)`);

        this.rejections$.set({ sequence: this.rejectionNoticesIssued, records });
    }

    /**
     *  Repairs a device that computed deletions it was not entitled to make.
     *
     *  Nothing about the local state can be trusted to describe the account after this, so it
     *  is not patched up piecemeal: the account is read back in full and written over what is
     *  here, which is the same remedy a remapped identifier gets.
     *
     *  @param withheld the deletions that were not sent; no repair is needed when empty
     */
    private async recoverFromWithheldDeletions(withheld: SyncOperation[]): Promise<void> {
        if (withheld.length === 0) {
            return;
        }
        this.LOG.warn("recoverFromWithheldDeletions", "Re-reading the account to repair");
        await this.pull();
    }

    /**
     *  Takes the account's state as authoritative for what holds a slot, and writes it over
     *  that - and only that - here.
     */
    private async pull(): Promise<void> {

        const session = this.sessions.getSession();
        if (!session) {
            return;
        }
        // A pull writes over the visible profiles, so it needs them to be the account's
        // already - merged and claimed. Pulling over another account's profiles would
        // overwrite them; pulling over profiles nobody has merged yet would discard them.
        if (this.profiles.getOwner()?.accountId !== session.userId) {
            this.LOG.warn("pull", "Visible profiles are not this account's yet; not pulling");
            return;
        }
        const snapshot = await this.fetchSnapshot();
        if (!snapshot) {
            return;
        }
        const account = inventoryFromSnapshot(snapshot);
        this.accountInventory = account;
        this.inventoryCycle = this.cycle;
        const previous = this.baselines.getFor(session.userId);

        // In scope for a pull: the account's slot-holders, unless this device holds one apart
        // (over a Fair Use cap here). Everything else on this device stays exactly as it is.
        const scope = decideSyncScope(
            account, this.localProfilesOf(await this.readEverythingLocally()), this.standing.rules());
        const inProfile: InScope = id => scope.slotProfileIds.has(id)
            && (scope.profiles[id]?.state ?? "SYNCHRONISED") === "SYNCHRONISED";
        const inWorkspace: InScope = id => scope.slotWorkspaceIds.has(id)
            && (scope.workspaces[id]?.state ?? "SYNCHRONISED") === "SYNCHRONISED";

        await this.applySnapshot(snapshot, previous, inProfile, inWorkspace);

        const onAccount = new Set([
            ...account.profiles.map(profile => profile.id),
            ...account.workspaces.map(workspace => workspace.id)
        ]);
        await this.baselines.store(session.userId, baselineAfter(
            previous,
            restrictToScope({
                profiles: snapshot.profiles,
                dataByProfileId: snapshot.dataByProfileId,
                closedTabsByProfileId: snapshot.closedTabsByProfileId,
                closedTabsSupported: snapshot.closedTabsSupported,
                visitsByProfileId: snapshot.visitsByProfileId,
                visitsSupported: snapshot.visitsSupported
            }, inProfile, inWorkspace),
            inProfile, inWorkspace,
            // Kept from before only while the account still has it; what was deleted there is
            // gone here too (applySnapshot), and must not linger as a deletion to send.
            id => onAccount.has(id)));
        this.remappedIds.clear();
        this.publishScope(decideSyncScope(
            account, this.localProfilesOf(await this.readEverythingLocally()), this.standing.rules()));
        this.activity$.set("idle");
    }

    /**
     *  Writes a snapshot over the local profiles that hold a slot.
     *
     *  Safe only because push() has already run: anything this device had in scope that the
     *  account did not is in the snapshot by now. What is not in the snapshot and was never
     *  confirmed by the account - refused, or without a slot - is local only, and stays.
     *
     *  @param snapshot    what the account holds
     *  @param previous    what this device last confirmed with it; null on a device that never did
     *  @param inProfile   whether a profile is written from the account
     *  @param inWorkspace whether a workspace is written from the account
     */
    private async applySnapshot(
        snapshot: MappedSnapshot,
        previous: SyncBaseline | null,
        inProfile: InScope,
        inWorkspace: InScope
    ): Promise<void> {

        this.applyingRemoteState = true;
        try {
            const knownRemotely = new Set(snapshot.profiles.map(profile => profile.id));
            const confirmedProfiles = new Set(previous?.profiles.map(profile => profile.id) ?? []);

            for (const profile of snapshot.profiles) {
                if (!inProfile(profile.id)) {
                    // Without a slot: this device keeps the copy it has, if any, as its last
                    // synchronised one, and is not handed one it never had.
                    continue;
                }
                const local = await this.readProfileData(profile.id);
                const heldBefore = new Set(Object.keys(
                    previous?.dataByProfileId[profile.id]?.environments ?? {}));

                await this.profiles.upsertProfile(profile);
                await this.appState.saveProfileData(
                    profile.id,
                    await this.withLocalWorkspaceChoice(profile.id, pulledProfileData(
                        local, snapshot.dataByProfileId[profile.id], inWorkspace, heldBefore, this.remappedIds)));
                if (snapshot.closedTabsSupported) {
                    // As the account holds them, untouched. Anything trimmed on the way in -
                    // a cap, a duplicate address, a clock that reads wrong - is a difference
                    // between this device and the account that the next change set dutifully
                    // reports, on every synchronisation, for ever. What the panel shows is a
                    // question for the panel; see ClosedTabsViewModel.
                    await writeClosedTabs(
                        profile.id, snapshot.closedTabsByProfileId[profile.id] ?? {});
                }
                // An account that does not keep closed tabs says nothing about this device's,
                // and a pull that overwrote them with the nothing it was told would empty the
                // panel every time the extension synchronised.
                if (snapshot.visitsSupported) {
                    // The same rule for browsing history: as the account holds it, untouched.
                    await writeVisits(profile.id, snapshot.visitsByProfileId[profile.id] ?? {});
                }
            }

            for (const local of this.profiles.getProfiles()) {
                if (knownRemotely.has(local.id)) {
                    continue;
                }
                if (confirmedProfiles.has(local.id) || this.remappedIds.has(local.id)) {
                    // Deleted on another device - the account held it, and holds it no more.
                    await this.profiles.removeProfile(local.id);
                    await this.appState.discardProfileData(local.id);
                }
                // Anything else the account does not hold is local only, and stays.
            }
            await this.reloadActiveProfile();
        } finally {
            this.applyingRemoteState = false;
        }
    }

    /**
     *  Keeps this device's open workspace when overwriting a profile.
     *
     *  Which workspace is open is not synchronised - two machines may sit on different ones,
     *  which is the whole point of the user's request - so it is read back off what is stored
     *  here rather than taken from the account.
     */
    private async withLocalWorkspaceChoice(
        profileId: string,
        incoming: ProfileData
    ): Promise<ProfileData> {

        const existing = await this.readProfileData(profileId);
        const chosen = existing?.activeEnvironmentId;

        return {
            ...incoming,
            activeEnvironmentId: chosen && incoming.environments[chosen]
                ? chosen
                : Object.keys(incoming.environments)[0] ?? null
        };
    }

    // ------------------------------------------------------------------ triggers

    private onLocalChange(): void {
        if (!this.running || this.applyingRemoteState) {
            return;
        }
        this.schedulePush();
    }

    private schedulePush(): void {
        if (this.pushTimer !== null) {
            window.clearTimeout(this.pushTimer);
        }
        this.pushTimer = window.setTimeout(() => {
            this.pushTimer = null;
            void this.enqueue(async () => {
                await this.push("steady-state", true);
                await this.reportInventory();
            });
        }, PUSH_DEBOUNCE);
    }

    private schedulePull(): void {
        if (this.pullTimer !== null) {
            window.clearTimeout(this.pullTimer);
        }
        this.pullTimer = window.setTimeout(() => {
            this.pullTimer = null;
            // Push first even here: this device may have unsent work of its own, and a pull
            // would overwrite it.
            void this.enqueue(() => this.pushThenPull());
        }, PULL_DEBOUNCE);
    }

    private cancelTimers(): void {
        if (this.pushTimer !== null) {
            window.clearTimeout(this.pushTimer);
            this.pushTimer = null;
        }
        if (this.pullTimer !== null) {
            window.clearTimeout(this.pullTimer);
            this.pullTimer = null;
        }
    }

    /**
     *  Runs synchronisations one after another.
     *
     *  Two overlapping runs could interleave a push with another's pull and push back data
     *  the pull was in the middle of replacing.
     */
    private enqueue(work: () => Promise<void>): Promise<void> {
        this.inFlight = this.inFlight
            .catch(() => undefined)
            .then(() => {
                this.cycle += 1;
                return work();
            })
            .catch(failure => this.LOG.warn("enqueue", "Synchronisation failed", failure));

        return this.inFlight;
    }

    // ------------------------------------------------------------------- helpers

    private async fetchSnapshot(): Promise<MappedSnapshot | null> {
        this.activity$.set("working");
        const result = await this.apiClient.fetchSnapshot();

        if (result.outcome !== "success") {
            this.activity$.set(result.outcome === "offline" ? "offline" : "idle");
            this.LOG.warn("fetchSnapshot", result.message);
            return null;
        }
        const planLimits = result.data.planLimits;
        const session = this.sessions.getSession();
        if (planLimits && session) {
            // Before anything is decided from this snapshot: the slots are counted under these.
            await this.standing.adopt(session.userId, planLimits.premium === true, planLimits.limits);
        }
        return SyncSnapshotMapper.toProfiles(result.data);
    }

    /**
     *  The account's profiles and workspaces without their content, which is what slots are
     *  decided against. Read from the list endpoints; a client without them (a test's) is
     *  answered from the snapshot instead. Null when the account could not be reached.
     */
    private async readAccountInventory(): Promise<AccountInventory | null> {
        if (typeof this.apiClient.listAccountProfiles !== "function") {
            const snapshot = await this.fetchSnapshot();
            this.accountInventory = snapshot ? inventoryFromSnapshot(snapshot) : null;
            this.inventoryCycle = this.cycle;
            return this.accountInventory;
        }
        this.activity$.set("working");
        const [profiles, environments] = await Promise.all([
            this.apiClient.listAccountProfiles(),
            this.apiClient.listAccountEnvironments()
        ]);
        if (profiles.outcome !== "success" || environments.outcome !== "success") {
            const offline = profiles.outcome === "offline" || environments.outcome === "offline";
            this.activity$.set(offline ? "offline" : "idle");
            this.LOG.warn("readAccountInventory", "The account's lists could not be read; not pushing");
            return null;
        }
        this.accountInventory = inventoryFromLists(profiles.data, environments.data);
        this.inventoryCycle = this.cycle;
        return this.accountInventory;
    }

    /** This device's profiles as the slot rules take them, in registry order. */
    private localProfilesOf(state: SyncBaseline): LocalProfile[] {
        return state.profiles.map(meta => ({ meta, data: state.dataByProfileId[meta.id] ?? null }));
    }

    /** Publishes what synchronises, for the page to mark what does not. */
    private publishScope(scope: SyncScope): void {
        const session = this.sessions.getSession();
        if (!session) {
            return;
        }
        this.scope$.set({ accountId: session.userId, profiles: scope.profiles, workspaces: scope.workspaces });
    }

    /**
     *  Tells the account what this installation holds, when that changed since it was last
     *  told: names, counts and whether each synchronises - never an address or a group name.
     */
    private async reportInventory(): Promise<void> {
        const scope = this.scope$.get();
        const session = this.sessions.getSession();
        if (!scope || !session || scope.accountId !== session.userId || !this.visibleProfilesBelongTo(session)) {
            return;
        }
        await this.inventoryReporter.report(
            session.userId, this.localProfilesOf(await this.readEverythingLocally()), scope,
            this.accountInventory);
    }

    /**
     *  Empties the closed tabs of every profile that has stopped recording them.
     *
     *  Turning recording off deletes the list on the device it was turned off on, but another
     *  device may have recorded a tab before it heard of the change and pushed it afterwards -
     *  and a pull stores what the account holds, exactly, so that tab arrives here too. It is
     *  not filtered out on the way in: anything a pull drops is a difference reported again on
     *  every synchronisation. It is deleted here instead, as a write, before the difference is
     *  computed, so this push carries the deletion and the account ends up empty as well.
     */
    private async emptyClosedTabsNotRecorded(): Promise<void> {
        for (const profile of this.profiles.getProfiles()) {
            if (settingsOf(profile).recordClosedTabs) {
                continue;
            }
            if (Object.keys(await readClosedTabs(profile.id)).length > 0) {
                this.LOG.debug("emptyClosedTabsNotRecorded", `Profile ${profile.id}`);
                await writeClosedTabs(profile.id, {});
            }
        }
    }

    /**
     *  Empties the browsing history of every profile that does not record it, for the reason
     *  and in the way `emptyClosedTabsNotRecorded` empties closed tabs.
     */
    private async emptyHistoryNotRecorded(): Promise<void> {
        for (const profile of this.profiles.getProfiles()) {
            if (settingsOf(profile).recordBrowsingHistory) {
                continue;
            }
            if (Object.keys(await readVisits(profile.id)).length > 0) {
                this.LOG.debug("emptyHistoryNotRecorded", `Profile ${profile.id}`);
                await writeVisits(profile.id, {});
            }
        }
    }

    /** Everything this device holds, in the shape the difference is computed against. */
    private async readEverythingLocally(): Promise<SyncBaseline> {

        const profiles = this.profiles.getProfiles();
        const dataByProfileId: Record<string, ProfileData> = {};

        const closedTabsByProfileId: Record<string, Record<string, ClosedTab>> = {};
        const visitsByProfileId: Record<string, Record<string, Visit>> = {};

        for (const profile of profiles) {
            const data = await this.readProfileData(profile.id);
            if (data) {
                dataByProfileId[profile.id] = data;
            }
            // Always read, even for a profile whose data this device does not hold: closed
            // tabs are stored under their own key, and an empty list is a real answer rather
            // than the "nothing known" that an absent ProfileData means.
            closedTabsByProfileId[profile.id] = await readClosedTabs(profile.id);
            visitsByProfileId[profile.id] = await readVisits(profile.id);
        }
        return { profiles, dataByProfileId, closedTabsByProfileId, visitsByProfileId };
    }

    /**
     *  A profile's data, taking the active one from memory rather than storage.
     *
     *  The active profile's most recent state is in the repository; reading it back from
     *  storage would race the write that is still settling.
     */
    private async readProfileData(profileId: string): Promise<ProfileData | null> {
        if (profileId === this.appState.getActiveProfileId()) {
            const { environments, groups, subgroups, links, activeEnvironmentId } =
                this.appState.state$.get();
            return { environments, groups, subgroups, links, activeEnvironmentId };
        }
        return this.appState.readProfileData(profileId);
    }

    /**
     *  Gives every local record an identifier the backend is able to store.
     *
     *  This extension has not always produced UUIDs - the seeded profile is called "default"
     *  and the example data is keyed "env-1" and so on - and the backend keys everything by a
     *  uuid column. Left alone, a first-time user's entire contents would be refused. It runs
     *  before the first push and does nothing at all once there is nothing left to rewrite.
     */
    private async makeLocalIdentifiersStorable(): Promise<void> {

        for (const profile of this.profiles.getProfiles()) {
            const data = await this.appState.readProfileData(profile.id);
            if (data) {
                const normalized = LocalIdentifierNormalizer.toStorableIdentifiers(data);
                if (Object.keys(normalized.replacements).length > 0) {
                    this.LOG.log("makeLocalIdentifiersStorable",
                        `Rewrote ${Object.keys(normalized.replacements).length} identifiers `
                        + `in profile ${profile.name}`);
                    await this.appState.saveProfileData(profile.id, normalized.data);
                }
            }
            await this.giveProfileAStorableIdentifier(profile);
        }
        await this.reloadActiveProfile();
    }

    /**
     *  Moves a profile whose own identifier the backend could not store.
     *
     *  The seeded profile is the reason this exists: its identifier is the literal string
     *  "default" on every installation ever made.
     *
     *  One such profile is not moved but forgotten: an unstorable identifier with nothing
     *  stored under it. There is nothing to carry across, so minting an identifier for it
     *  would put a profile on the account that the user never made and that no device can
     *  ever show anything in. It is only ever the registry's seeded entry reappearing after
     *  this method already renamed it once, which is why the last profile is never dropped -
     *  a device with one empty profile is a first run, not a stray.
     */
    private async giveProfileAStorableIdentifier(profile: ProfileMeta): Promise<void> {

        if (isStorableIdentifier(profile.id)) {
            return;
        }
        const data = await this.appState.readProfileData(profile.id);

        if (!data && this.profiles.getProfiles().length > 1) {
            this.LOG.log("giveProfileAStorableIdentifier",
                `Forgetting empty profile ${profile.id} instead of pushing it`);
            await this.profiles.removeProfile(profile.id);
            await this.appState.discardProfileData(profile.id);
            return;
        }

        const replacement = uid();
        const wasActive = this.appState.getActiveProfileId() === profile.id;

        await this.profiles.upsertProfile({ ...profile, id: replacement });
        await this.appState.saveProfileData(
            replacement, data ?? SyncSnapshotMapper.emptyProfileData());

        await this.profiles.removeProfile(profile.id);
        await this.appState.discardProfileData(profile.id);

        if (wasActive) {
            await this.profiles.setActiveProfile(replacement);
        }
    }

    /** Reloads whatever is now stored for the active profile, so the page shows it. */
    /**
     *  The placeholder profiles to drop in favour of what the account holds.
     *
     *  Only while the visible set is still awaiting its account - or for the first-run example
     *  profile, emptied of its examples at sign-in - only when the account has profiles to take
     *  their place, and only placeholders that are still empty - anything the
     *  user put in one while waiting was put there as this account, and is merged like any
     *  other local profile.
     *
     *  @param snapshot what the account holds
     *  @return the identifiers of the placeholders to drop
     */
    private async emptyPlaceholdersToReplace(snapshot: MappedSnapshot): Promise<Set<string>> {
        if (snapshot.profiles.length === 0) {
            return new Set();
        }
        const awaiting = this.profiles.isAwaitingAccount();
        const empty = new Set<string>();
        for (const profile of this.profiles.getProfiles()) {
            // The placeholder an account switch left, or the first-run example profile emptied
            // of its examples at sign-in (`removeUntouchedExamples`).
            if (!awaiting && profile.example !== true) {
                continue;
            }
            const data = await this.readProfileData(profile.id);
            if (!data || Object.keys(data.environments).length === 0) {
                empty.add(profile.id);
            }
        }
        return empty;
    }

    private async reloadActiveProfile(): Promise<void> {
        this.applyingRemoteState = true;
        try {
            await this.appState.switchProfile(this.profiles.getActiveProfileId());
        } finally {
            this.applyingRemoteState = false;
        }
    }

    /** Profiles pair by name, compared the way a person would compare them. */
    private asName(value: string): string {
        return value.trim().toLowerCase();
    }
}

export const syncCoordinator = new SyncCoordinator();

/**
 *  Joins two lists of closed tabs, as first contact with an account has to.
 *
 *  Both are logs of things that really happened, on two machines that have never met, so
 *  neither can be thrown away - which is why this is a union and not the "the account wins"
 *  rule that settles a renamed group.
 *
 *  **It joins and does nothing else.** It does not cap the result, and it does not drop the
 *  same address twice over, however tempting both are: what this device stores has to stay
 *  equal to what the account holds, or the difference between them is reported on every
 *  synchronisation for the rest of the day - and every report draws a change notification that
 *  sets the other connected device doing the same. The list is kept in bounds where it is
 *  written to (`recordClosedTab`), and made readable where it is drawn (`ClosedTabsViewModel`).
 *
 *  @param local  what this device recorded
 *  @param remote what the account holds
 *  @return the joined list, keyed by identifier
 */
export function mergeClosedTabs(
    local: Record<string, ClosedTab>,
    remote: Record<string, ClosedTab>
): Record<string, ClosedTab> {
    return { ...remote, ...local };
}

/**
 *  Joins this device's browsing history with the account's at first contact - a union, for the
 *  reason `mergeClosedTabs` is one, and with the same restraint: nothing capped, nothing dropped.
 */
export function mergeVisits(
    local: Record<string, Visit>,
    remote: Record<string, Visit>
): Record<string, Visit> {
    return { ...remote, ...local };
}
