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

import { Logger } from "../../utils/logger";
import { ObservableValue } from "../../utils/observableValue";

/** How long to wait after a local change before pushing, so a burst becomes one request. */
const PUSH_DEBOUNCE = 800;

/** How long to wait after being told the account changed elsewhere before pulling. */
const PULL_DEBOUNCE = 400;

/** What the account menu can say about synchronisation. */
export type SyncActivity = "idle" | "working" | "offline";

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

    constructor(
        appState: AppStateRepository = appStateRepository,
        profiles: ProfileRepository = profileRepository,
        sessions: SessionRepository = sessionRepository,
        baselines: SyncBaselineRepository = syncBaselineRepository,
        apiClient: BackendApiClient = backendApiClient
    ) {
        this.appState = appState;
        this.profiles = profiles;
        this.sessions = sessions;
        this.baselines = baselines;
        this.apiClient = apiClient;
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
            await this.enqueue(() => this.beginForAccount(session));
            return;
        }

        if (!session && this.running) {
            this.running = false;
            this.LOG.log("onSessionChanged", "Signed out; synchronisation stopped");
            this.cancelTimers();
            this.channel.disconnect();
            // The baseline describes an account this device is no longer talking to. The
            // user's links, groups and profiles are deliberately left exactly as they are.
            await this.baselines.clear();
        }
    }

    /**
     *  Brings a freshly signed-in device into step with its account.
     *
     *  A device that has never synchronised this account merges rather than replaces - that
     *  is the case where both ends already hold links and neither may be thrown away.
     */
    private async beginForAccount(session: SyncSession): Promise<void> {

        await this.makeLocalIdentifiersStorable();

        if (this.baselines.getFor(session.userId) === null) {
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

        const snapshot = await this.fetchSnapshot();
        if (!snapshot) {
            // Cannot merge without knowing what the account holds. Nothing is pushed, because
            // pushing before merging would duplicate everything the account already has.
            this.LOG.warn("mergeWithAccount", "Account unreachable; merge deferred");
            return;
        }

        const remoteByName = new Map(
            snapshot.profiles.map(profile => [this.asName(profile.name), profile]));

        for (const local of this.profiles.getProfiles()) {
            const remote = remoteByName.get(this.asName(local.name));

            if (!remote) {
                continue;   // The account has never seen it; the push below creates it.
            }
            await this.mergeOneProfile(local, remote, snapshot);
            remoteByName.delete(this.asName(local.name));
        }

        // Whatever is left is a profile this device has never had; take it as it stands.
        for (const remote of remoteByName.values()) {
            await this.profiles.upsertProfile(remote);
            await this.appState.saveProfileData(
                remote.id, snapshot.dataByProfileId[remote.id]);
        }

        // The baseline is what the account holds, not what this device now holds, so the push
        // that follows carries exactly the local additions the merge kept.
        await this.baselines.store(session.userId, {
            profiles: snapshot.profiles,
            dataByProfileId: snapshot.dataByProfileId
        });

        await this.reloadActiveProfile();
        await this.push();
    }

    /** Merges one local profile into its counterpart on the account. */
    private async mergeOneProfile(
        local: ProfileMeta,
        remote: ProfileMeta,
        snapshot: MappedSnapshot
    ): Promise<void> {

        const localData = await this.readProfileData(local.id);
        const merged = ProfileMergeEngine.merge(
            localData ?? SyncSnapshotMapper.emptyProfileData(),
            snapshot.dataByProfileId[remote.id]);

        await this.profiles.upsertProfile(remote);
        await this.appState.saveProfileData(remote.id, merged.merged);

        if (local.id !== remote.id) {
            // The pair are the same profile under two names for it. The account's identifier
            // wins, so this device drops its own and everything it stored under it - the data
            // has just been written under the identifier that survives.
            const wasActive = this.appState.getActiveProfileId() === local.id;

            await this.profiles.removeProfile(local.id);
            await this.appState.discardProfileData(local.id);

            if (wasActive) {
                await this.profiles.setActiveProfile(remote.id);
                await this.appState.switchProfile(remote.id);
            }
        }
    }

    // ------------------------------------------------------------- steady state

    private async pushThenPull(): Promise<void> {
        await this.push();
        await this.pull();
    }

    /**
     *  Sends everything the account is missing.
     *
     *  The baseline only moves on once the server has confirmed the batch, so a failure here
     *  costs nothing but time: the same difference is computed again next time.
     */
    private async push(): Promise<void> {

        const session = this.sessions.getSession();
        if (!session) {
            return;
        }

        const baseline = this.baselines.getFor(session.userId);
        if (!baseline) {
            // This device has never synchronised this account, which normally means the merge
            // at sign-in could not reach the server. Retry it here rather than waiting for a
            // reload, and stop: merging ends by pushing anyway. Pushing without having merged
            // would duplicate everything the account already holds.
            await this.mergeWithAccount(session);
            return;
        }

        const current = await this.readEverythingLocally();
        const operations = ChangeSetBuilder.build(
            baseline, current.profiles, current.dataByProfileId);

        if (operations.length === 0) {
            this.activity$.set("idle");
            return;
        }

        this.LOG.debug("push", `Sending ${operations.length} operations`);
        this.activity$.set("working");

        const result = await this.apiClient.pushChanges({
            originDeviceId: installationIdentity.getInstallationId(),
            operations
        });

        if (result.outcome !== "success") {
            this.activity$.set(result.outcome === "offline" ? "offline" : "idle");
            this.LOG.warn("push", `Not applied: ${result.message}`);
            return;
        }

        if (result.data.remaps.length > 0 || result.data.rejected.length > 0) {
            // The server stored something under an identifier of its own, or refused an
            // operation. Either way this device's picture is now wrong in a way a difference
            // cannot express, so the following pull is left to correct it wholesale.
            this.LOG.warn("push",
                `${result.data.remaps.length} remapped, ${result.data.rejected.length} refused`);
            return;
        }

        await this.baselines.store(session.userId, current);
        this.activity$.set("idle");
    }

    /** Takes the account's state as authoritative and writes it over what is here. */
    private async pull(): Promise<void> {

        const session = this.sessions.getSession();
        if (!session) {
            return;
        }
        const snapshot = await this.fetchSnapshot();
        if (!snapshot) {
            return;
        }

        await this.applySnapshot(snapshot);
        await this.baselines.store(session.userId, {
            profiles: snapshot.profiles,
            dataByProfileId: snapshot.dataByProfileId
        });
        this.activity$.set("idle");
    }

    /**
     *  Writes a snapshot over the local profiles.
     *
     *  Safe only because push() has already run: anything this device had that the account
     *  did not is in the snapshot by now.
     */
    private async applySnapshot(snapshot: MappedSnapshot): Promise<void> {

        this.applyingRemoteState = true;
        try {
            const knownRemotely = new Set(snapshot.profiles.map(profile => profile.id));

            for (const profile of snapshot.profiles) {
                await this.profiles.upsertProfile(profile);
                await this.appState.saveProfileData(
                    profile.id,
                    await this.withLocalWorkspaceChoice(
                        profile.id, snapshot.dataByProfileId[profile.id]));
            }

            for (const local of this.profiles.getProfiles()) {
                if (!knownRemotely.has(local.id)) {
                    // Deleted on another device. Absence from the snapshot is the deletion.
                    await this.profiles.removeProfile(local.id);
                    await this.appState.discardProfileData(local.id);
                }
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
            void this.enqueue(() => this.push());
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
            .then(work)
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
        return SyncSnapshotMapper.toProfiles(result.data);
    }

    /** Everything this device holds, in the shape the difference is computed against. */
    private async readEverythingLocally(): Promise<SyncBaseline> {

        const profiles = this.profiles.getProfiles();
        const dataByProfileId: Record<string, ProfileData> = {};

        for (const profile of profiles) {
            const data = await this.readProfileData(profile.id);
            if (data) {
                dataByProfileId[profile.id] = data;
            }
        }
        return { profiles, dataByProfileId };
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
     */
    private async giveProfileAStorableIdentifier(profile: ProfileMeta): Promise<void> {

        if (isStorableIdentifier(profile.id)) {
            return;
        }
        const replacement = uid();
        const data = await this.appState.readProfileData(profile.id);
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
