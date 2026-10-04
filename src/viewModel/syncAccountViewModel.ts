// data layer
import { ApiResult, backendApiClient, BackendApiClient } from "../backend/sync/BackendApiClient";
import { SessionRepository, sessionRepository, SyncSession, TokenPairDto } from "../backend/sync/SessionRepository";
import { buildWebsiteUrl, WEBSITE_PATHS } from "../backend/sync/SyncConfiguration";
import { HeldApartNotice, SyncActivity, syncCoordinator, SyncRejectionNotice } from "../backend/sync/SyncCoordinator";
import { removeUntouchedExamples } from "../backend/sync/ExampleDataRemoval";
import { appStateRepository } from "../backend/repository/AppStateRepository";
import { DeviceNameReconciler, DeviceNameVerdict } from "../backend/sync/DeviceNameReconciler";
import { installationIdentity } from "../backend/sync/InstallationIdentity";
import { accountStandingRepository, AccountStandingRepository } from "../backend/sync/AccountStandingRepository";
import { profileRepository, ProfileRepository, RegistryOwner } from "../backend/repository/ProfileRepository";
import { ChoiceDialog } from "../ui/partials/choiceDialog";
import { InputDialog } from "../ui/partials/inputDialog";
import { showNotice } from "../ui/partials/confirmations";

// utils
import { Logger } from "../utils/logger";
import { ObservableValue } from "../utils/observableValue";
import { t } from "../i18n/i18n";
import { FREE_PLAN_LIMITS, LimitRefusal } from "../backend/entity/PlanLimits";
import { describeFairUseRefusal } from "./fairUseNoticeViewModel";

/**
 *  Opens the website's account settings in a new tab: where premium is bought, and the one
 *  upgrade offer every part of the extension sends the user to - the menu, and a free plan
 *  limit's notice.
 *
 *  @param standing told that the answer it holds is stale, since whoever goes to upgrade comes
 *                  back to a new tab expecting the advertisement and the limits to be gone
 */
export function openPremiumUpgradePage(
    standing: Pick<AccountStandingRepository, "markStale"> = accountStandingRepository
): void {
    void standing.markStale();
    chrome.tabs.create({ url: buildWebsiteUrl(WEBSITE_PATHS.accountSettings) });
}

/** Opens the website's Fair Use Policy, which also says how to ask for a raise. */
export function openFairUsePage(): void {
    chrome.tabs.create({ url: buildWebsiteUrl(WEBSITE_PATHS.fairUse) });
}

/**
 *  Asks whoever draws the log-in dialog to show it: a limit's notice on an installation nobody
 *  is signed in to offers logging in to an account with premium. A counter, so every request
 *  is news to `ObservableValue`.
 */
export const logInRequests$ = new ObservableValue<number>(0);

/** Requests the log-in dialog; see `logInRequests$`. */
export function requestLogIn(): void {
    logInRequests$.set(logInRequests$.get() + 1);
}

/** What the application menu needs to know about the signed-in account. */
export interface AccountDTO {
    signedIn: boolean;
    username: string | null;

    /** What to tell the user about synchronisation right now. */
    syncStatus: string | null;

    /** Whether the account is premium, which takes the upgrade offer out of the menu. */
    premium: boolean;

    /**
     *  Whose links are on screen while nobody is signed in: the account they belong to, which
     *  this browser was signed out of. Null while signed in, and on a browser whose links
     *  belong to no account - a fresh install is never told it was signed out.
     */
    signedOutOf: string | null;
}

/**
 *  View model behind the account section of the application menu.
 *
 *  It does not extend AbstractViewModel on purpose: that base class exists to map AppState
 *  onto a component's DTO, and the account has nothing to do with AppState — a user's links
 *  are the same whether they are signed in or not. What it does share is the shape the rest
 *  of the view models have, an "observables" bag plus an initialize(), so that a component
 *  binds to it exactly the way it binds to any other.
 */
export class SyncAccountViewModel {

    private LOG: Logger = new Logger("SyncAccountViewModel");

    private apiClient: BackendApiClient;
    private sessions: SessionRepository;
    private deviceNames: DeviceNameReconciler;

    public readonly observables = {
        account: new ObservableValue<AccountDTO>(
            { signedIn: false, username: null, syncStatus: null, premium: false, signedOutOf: null })
    };

    /** Last known session and synchronisation state, combined into the DTO on any change. */
    private session: SyncSession | null = null;
    private activity: SyncActivity = "idle";
    private premium: boolean = false;
    /** The limit the account refused this device's changes over, while it stands. */
    private fairUseRefusal: LimitRefusal | null = null;
    private profilesOwner: RegistryOwner | null = null;

    private standing: AccountStandingRepository;
    private profiles: ProfileRepository;

    /**
     *  @param apiClient  talks to the backend; the singleton in normal use.
     *  @param sessions   holds the tokens; the singleton in normal use.
     */
    constructor(
        apiClient: BackendApiClient = backendApiClient,
        sessions: SessionRepository = sessionRepository,
        standing: AccountStandingRepository = accountStandingRepository,
        profiles: ProfileRepository = profileRepository
    ) {
        this.apiClient = apiClient;
        this.sessions = sessions;
        this.standing = standing;
        this.profiles = profiles;
        this.deviceNames = new DeviceNameReconciler(apiClient, sessions);
    }

    /** Starts publishing the account state; fires immediately with the current session. */
    public initialize(): void {
        this.sessions.session$.subscribe((session: SyncSession | null) => {
            this.session = session;
            this.publishAccount();
        });
        syncCoordinator.activity$.subscribe((activity: SyncActivity) => {
            this.activity = activity;
            this.publishAccount();
        });
        this.standing.premium$.subscribe((premium: boolean) => {
            this.premium = premium;
            this.publishAccount();
        });
        this.profiles.owner$.subscribe((owner: RegistryOwner | null) => {
            this.profilesOwner = owner;
            this.publishAccount();
        });
        syncCoordinator.limitRefusal$.subscribe((refusal: LimitRefusal | null) => {
            this.fairUseRefusal = refusal;
            this.publishAccount();
        });
        syncCoordinator.rejections$.subscribe((notice: SyncRejectionNotice | null) => {
            this.reportRefusedChanges(notice);
        });
        syncCoordinator.heldApart$.subscribe((notice: HeldApartNotice | null) => {
            if (notice) {
                void this.adviseOnHeldApart(notice);
            }
        });
        let revokedReplayed = false;
        this.sessions.revoked$.subscribe(ended => {
            if (!revokedReplayed) {
                revokedReplayed = true;     // the current value, not news
                return;
            }
            // Told why - beyond the installations limit - it is the refused sign-in's message,
            // with the devices page the account named.
            void (ended.refusal ? this.offerDeviceLimitWayOut(ended.refusal) : this.explainRevokedSession());
        });
    }

    /**
     *  Tells the user that the account would not take something, and that it is gone.
     *
     *  Worth interrupting for, which little else here is: the records named are ones the user
     *  made, and the pull behind the push is about to take them off this device for good.
     *  Saying nothing left them to notice a workspace had gone missing on their own.
     *
     *  **The wording speaks of what is about to happen, not what has.** The notice is up
     *  while the pull it warns about runs, or before it - and on a push that was not followed
     *  by one, the records are still there and stay until the next. A notice saying they were
     *  already gone could be read while they were plainly still on the screen.
     *
     *  No identifier and no reason code is shown. Neither means anything to the person
     *  reading, and the reasons the account can give are about its own bookkeeping - a parent
     *  that is not there, a value it needed - not about anything the user did wrong.
     *
     *  @param notice what was refused, or null for the value every subscription starts on
     */
    private reportRefusedChanges(notice: SyncRejectionNotice | null): void {
        if (!notice) {
            // subscribe() hands over the current value straight away, and at that moment
            // nothing has been refused. Only what arrives afterwards is news.
            return;
        }
        this.LOG.warn("reportRefusedChanges",
            `${notice.records.length} change(s) refused by the account`);

        this.report(t("sync.changesRefused", { count: notice.records.length }));
    }

    /** Combines who is signed in with how synchronisation is faring. */
    private publishAccount(): void {
        this.observables.account.set({
            signedIn: this.session !== null,
            username: this.session?.username ?? null,
            syncStatus: this.session === null ? null : this.describeActivity(),
            premium: this.session !== null && this.premium,
            signedOutOf: this.session === null ? this.profilesOwner?.username ?? null : null
        });
    }

    /**
     *  Wording for the synchronisation state.
     *
     *  Being offline is stated plainly and without alarm: it is an ordinary condition for a
     *  browser extension, nothing the user has to act on, and the changes they make meanwhile
     *  are sent as soon as the connection returns.
     */
    private describeActivity(): string {
        if (this.fairUseRefusal && this.activity !== "working") {
            // Not "Synchronised", which it is not: the account refused this device's changes
            // over a fair use limit, and they stay here until there is room for them.
            return t("sync.status.fairUseLimit", {
                reason: describeFairUseRefusal(this.fairUseRefusal)
            });
        }
        switch (this.activity) {
            case "working":
                return t("sync.status.working");
            case "offline":
                return t("sync.status.offline");
            default:
                return t("sync.status.idle");
        }
    }

    /** Opens the website's registration page in a new tab; the extension hosts no such form. */
    public openRegistrationPage(): void {
        const url = buildWebsiteUrl(WEBSITE_PATHS.register);
        this.LOG.debug("openRegistrationPage", url);
        chrome.tabs.create({ url });
    }

    /**
     *  Opens the website's account settings in a new tab. Upgrading to premium lives there,
     *  and the extension deliberately takes no payment itself.
     */
    public openAccountSettingsPage(): void {
        // Whoever goes to upgrade comes back to a new tab expecting the advertisement to be
        // gone, so that tab asks the account instead of trusting what it last heard.
        this.LOG.debug("openAccountSettingsPage", WEBSITE_PATHS.accountSettings);
        openPremiumUpgradePage(this.standing);
    }

    /**
     *  Opens the website's devices page, where an installation is signed out and where what
     *  each one holds can be audited.
     *
     *  @param manageUrl the address the account named for it, when it named one
     */
    public openDevicesPage(manageUrl?: string): void {
        const url = manageUrl ?? buildWebsiteUrl(WEBSITE_PATHS.devices);
        this.LOG.debug("openDevicesPage", url);
        chrome.tabs.create({ url });
    }

    /**
     *  Signs in with a username or email address and a password.
     *
     *  @param usernameOrEmail what the user typed to identify themselves
     *  @param password        their password
     *  @param deviceName      what to call this installation in the account's device list;
     *                         optional, and blank means keep the automatic label
     */
    public async logIn(
        usernameOrEmail: string | null,
        password: string | null,
        deviceName?: string | null
    ): Promise<void> {

        if (!usernameOrEmail || !usernameOrEmail.trim() || !password) {
            this.report(t("sync.credentialsRequired"));
            return;
        }
        this.LOG.debug("logIn", `as ${usernameOrEmail}`);

        // Named before signing in, not after: the name travels in the header the sign-in itself
        // sends, so the device row is created carrying it rather than being renamed a moment later.
        await installationIdentity.setName(deviceName);

        const result = await this.apiClient.logInWithPassword(usernameOrEmail.trim(), password);
        await this.storeIssuedTokens(result, t("sync.logInFailed"));
    }

    /**
     *  Signs in with the connect code the website shows to a signed-in user.
     *
     *  @param code       the code from the website's devices page
     *  @param deviceName what to call this installation in the account's device list; optional,
     *                    and blank means keep the automatic label
     */
    public async connectWithCode(code: string | null, deviceName?: string | null): Promise<void> {
        if (!code || !code.trim()) {
            this.report(t("sync.connectCodeRequired"));
            return;
        }
        this.LOG.debug("connectWithCode", "redeeming connect code");
        await installationIdentity.setName(deviceName);

        const result = await this.apiClient.redeemConnectCode(code.trim());
        await this.storeIssuedTokens(result, t("sync.connectCodeRefused"));
    }

    /**
     *  Signs out: revokes the session on the server and forgets the tokens here.
     *
     *  Local data is never touched — the user keeps every workspace, group and link they
     *  have, they simply stop being synchronised. The local session is cleared even when
     *  the server cannot be reached, because the user asked to be signed out.
     */
    public async logOut(): Promise<void> {
        this.LOG.debug("logOut", "signing out");
        const result = await this.apiClient.logOut();
        await this.sessions.clear();
        if (result.outcome === "offline") {
            this.report(t("sync.loggedOutOffline"));
        }
    }

    /** Stores a freshly issued token pair, or tells the user why there is none. */
    private async storeIssuedTokens(
        result: ApiResult<TokenPairDto>,
        failureHeadline: string
    ): Promise<void> {
        if (result.outcome === "success") {
            // Untouched example data goes before the account sees anything: it was only ever
            // there to show what the page does, and is never synchronised (`ExampleData.ts`).
            await removeUntouchedExamples(appStateRepository, this.profiles);
            const session = await this.sessions.storeTokenPair(result.data);
            this.LOG.log("storeIssuedTokens", `Signed in as ${session.username}`);
            await this.reconcileDeviceName();
            return;
        }
        this.LOG.warn("storeIssuedTokens", `${failureHeadline} ${result.message}`);
        if (result.outcome === "rejected" && result.limitRefusal?.limit === "DEVICES") {
            // Nothing was stored, so this installation stays signed out and keeps working
            // locally. The account is what counts its installations; this one only says so.
            void this.offerDeviceLimitWayOut(result.limitRefusal);
            return;
        }
        this.report(t("sync.reportedFailure",
            { headline: failureHeadline, message: result.message }));
    }

    /**
     *  Settles what the name the user chose means, now that the account can be asked.
     *
     *  Runs after every successful sign-in and does nothing at all in the ordinary case, which
     *  is a user who typed no name or typed one nobody else is using. It is deliberately not
     *  allowed to fail a sign-in: the tokens are already stored and synchronisation is already
     *  under way by the time this runs, so the worst outcome here is a device list with two
     *  rows of the same name in it.
     */
    private async reconcileDeviceName(): Promise<void> {

        const verdict = await this.deviceNames.assess(installationIdentity.getName());

        switch (verdict.kind) {
            case "settled":
                return;

            case "returning":
                // The name belongs to a device that is signed out, which is what a reinstall
                // looks like. Nothing is being taken away from anyone, so it is not worth a
                // question - the row is adopted and the user is simply told.
                if (await this.deviceNames.takeOver(verdict.to)) {
                    this.report(t("sync.deviceReturning",
                        { name: verdict.to.deviceName }));
                }
                return;

            case "taken":
                await this.resolveNameAlreadyInUse(verdict.by.deviceName, verdict);
                return;
        }
    }

    /**
     *  Asks what to do about a name another signed-in device is already using.
     *
     *  Three answers, and none of them is wrong. Taking over is the reinstall case and the
     *  reason "overwrite" was ever wanted. Renaming is for somebody who simply reached for a
     *  name that was taken. Doing nothing is a real answer too: names may repeat, so a user who
     *  wants two devices called the same thing is allowed to have them, and dismissing the
     *  dialog leaves exactly that.
     *
     *  @param takenName the name in question
     *  @param verdict   the device already carrying it
     */
    private async resolveNameAlreadyInUse(
        takenName: string,
        verdict: Extract<DeviceNameVerdict, { kind: "taken" }>
    ): Promise<void> {

        const answer = await new ChoiceDialog<"take-over" | "rename" | "keep">(
            t("sync.deviceNameTaken.title"),
            t("sync.deviceNameTaken.message", { name: takenName }),
            [
                { label: t("sync.deviceNameTaken.takeOver"), value: "take-over", danger: true },
                { label: t("sync.deviceNameTaken.rename"), value: "rename" },
                { label: t("sync.deviceNameTaken.keep"), value: "keep" }
            ]).ask();

        if (answer === "take-over") {
            if (await this.deviceNames.takeOver(verdict.by)) {
                this.report(t("sync.deviceTakenOver", { name: takenName }));
            }
            return;
        }

        if (answer === "rename") {
            await this.askForAnotherDeviceName();
        }
        // "keep", and dismissal, both mean leave it: the duplicate is what the user asked for.
    }

    /**
     *  Collects a different name and applies it to this device.
     *
     *  Awaited rather than left to a callback, because the first-run screen reloads the page
     *  as soon as signing in resolves and would otherwise tear this dialog off mid-answer.
     *
     *  Deliberately not recursive. If the replacement is taken as well, the user is told and
     *  left alone rather than being asked the same question again - a dialog that reappears
     *  until an answer satisfies it is a trap, and a duplicate name breaks nothing.
     */
    private async askForAnotherDeviceName(): Promise<void> {
        const answer = await new InputDialog(
            t("sync.renameDeviceDialog.title"),
            { [t("dialogs.fields.deviceName")]: { type: "string", key: "deviceName" } },
            () => undefined
        ).ask();

        if (answer) {
            await this.applyAnotherDeviceName(answer["deviceName"]);
        }
    }

    /**
     *  Stores and sends a replacement name.
     *
     *  @param deviceName the new name, which may be blank to fall back to the automatic label
     */
    private async applyAnotherDeviceName(deviceName: string | null): Promise<void> {
        await installationIdentity.setName(deviceName);

        const chosen = installationIdentity.getName();
        if (!chosen) {
            // Cleared rather than replaced. The automatic label returns on the next call that
            // carries a device name; renaming the row to it here would be inventing a decision.
            return;
        }
        if (!await this.deviceNames.renameThisDevice(chosen)) {
            this.report(t("sync.deviceNotRenamed"));
        }
    }

    /**
     *  Says that the account already has as many synchronised installations as its plan allows,
     *  and offers the ways on: signing out of one on the website's devices page - the address
     *  the account named - or, on the free plan, upgrading. Not awaited by the sign-in that was
     *  refused.
     *
     *  @param refusal the account's refusal, with its number and its devices page
     */
    private async offerDeviceLimitWayOut(refusal: LimitRefusal): Promise<void> {
        const freePlan = refusal.kind === "FREE_PLAN";
        const answer = await new ChoiceDialog<"devices" | "upgrade" | "ok">(
            freePlan ? t("fairUse.freePlan.title") : t("fairUse.title"),
            describeFairUseRefusal(refusal),
            [
                { label: t("fairUse.freePlan.openDevices"), value: "devices" },
                ...(freePlan ? [{ label: t("fairUse.freePlan.upgrade"), value: "upgrade" as const }] : []),
                { label: t("common.ok"), value: "ok" }
            ]
        ).ask();
        if (answer === "devices") {
            this.openDevicesPage(refusal.manageUrl);
        } else if (answer === "upgrade") {
            this.openAccountSettingsPage();
        }
    }

    /**
     *  Says why this browser is signed out when the account ended the session: revoked from
     *  the website, or - when premium ended - one of the installations beyond the free plan's
     *  limit. Worded like a refused sign-in, with the same two ways on.
     */
    private async explainRevokedSession(): Promise<void> {
        const answer = await new ChoiceDialog<"devices" | "upgrade" | "ok">(
            t("fairUse.revoked.title"),
            t("fairUse.revoked.message", { maximum: FREE_PLAN_LIMITS.devices }),
            [
                { label: t("fairUse.freePlan.openDevices"), value: "devices" },
                { label: t("fairUse.freePlan.upgrade"), value: "upgrade" },
                { label: t("common.ok"), value: "ok" }
            ]
        ).ask();
        if (answer === "devices") {
            this.openDevicesPage();
        } else if (answer === "upgrade") {
            this.openAccountSettingsPage();
        }
    }

    /**
     *  Says that a merge by name stopped short of a Fair Use cap, and where to go from there:
     *  the devices page to audit, or the policy to ask for a raise.
     */
    private async adviseOnHeldApart(notice: HeldApartNotice): Promise<void> {
        const answer = await new ChoiceDialog<"devices" | "policy" | "ok">(
            t("fairUse.heldApart.title"),
            t("fairUse.heldApart.message", { names: notice.names.join(", ") }),
            [
                { label: t("fairUse.freePlan.openDevices"), value: "devices" },
                { label: t("fairUse.openFairUse"), value: "policy" },
                { label: t("common.ok"), value: "ok" }
            ]
        ).ask();
        if (answer === "devices") {
            this.openDevicesPage();
        } else if (answer === "policy") {
            openFairUsePage();
        }
    }

    /**
     *  Tells the user something about their account, in the page's own modal rather than the
     *  browser's alert box. Not awaited: nothing that reports waits on the user reading it.
     */
    private report(message: string): void {
        void showNotice(t("sync.noticeTitle"), message);
    }
}
