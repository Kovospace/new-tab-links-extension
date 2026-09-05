import { BackendApiClient, UserDeviceDto } from "./BackendApiClient";
import { SessionRepository, SyncSession } from "./SessionRepository";
import { Logger } from "../../utils/logger";

/** What the account's device list turned out to say about the name this installation chose. */
export type DeviceNameVerdict =

    /** Nothing to do: no name was chosen, the list is unreadable, or the name is unused. */
    | { kind: "settled" }

    /**
     *  Another device already carries this name and is still signed in. Only the user can say
     *  what that means, so this is the one case that has to ask.
     */
    | { kind: "taken"; by: UserDeviceDto }

    /**
     *  Another device carries this name but has been signed out. Treated as the same place
     *  coming back rather than as a clash, so it is adopted without asking and merely reported.
     */
    | { kind: "returning"; to: UserDeviceDto };

/**
 *  Works out what a chosen device name means, and carries out what the user decides.
 *
 *  **Why this lives in the extension and not the backend.** The backend cannot tell a name the
 *  user typed from the automatic label, and the automatic label is identical for every
 *  installation on one machine - so a backend-side check would report a clash for every second
 *  browser on a laptop, including for the users who never asked to name anything. Only the
 *  client knows whether a name was chosen, and whether choosing it is what just happened. The
 *  policy is a matter of what to say to a person, which is this side's business anyway.
 *
 *  Nothing here identifies a device. Names are labels: two devices may share one, the backend
 *  neither refuses nor reports duplicates, and a rename cannot merge or split anything. What
 *  this class does is spare the user a list with two rows called "Work laptop" in it, and offer
 *  the one thing a duplicate usually means - that this is the same place, reinstalled.
 */
export class DeviceNameReconciler {

    private LOG: Logger = new Logger("DeviceNameReconciler");

    private readonly apiClient: BackendApiClient;
    private readonly sessions: SessionRepository;

    /**
     *  @param apiClient reads the device list and performs rename and take-over
     *  @param sessions  supplies the device row this installation was recorded as
     */
    constructor(apiClient: BackendApiClient, sessions: SessionRepository) {
        this.apiClient = apiClient;
        this.sessions = sessions;
    }

    /**
     *  Decides what the chosen name means, without changing anything.
     *
     *  Every failure answers "settled". A name is a convenience, so a device list that cannot
     *  be read is a reason to leave the user alone, never a reason to interrupt a sign-in that
     *  has otherwise succeeded.
     *
     *  @param chosenName the name the user typed, or null when they typed none
     *  @return what the account's list says about it
     */
    public async assess(chosenName: string | null): Promise<DeviceNameVerdict> {

        if (!chosenName) {
            return { kind: "settled" };
        }

        const session = this.sessions.getSession();
        if (!session?.deviceId) {
            // An older backend does not report which row this sign-in became, and without that
            // this device cannot be told apart from a device that genuinely shares its name.
            this.LOG.debug("assess", "Backend did not name this device row; nothing to reconcile");
            return { kind: "settled" };
        }

        const result = await this.apiClient.listDevices();
        if (result.outcome !== "success") {
            this.LOG.warn("assess", `Device list unavailable: ${result.message}`);
            return { kind: "settled" };
        }

        const namesake = this.findNamesake(result.data, session, chosenName);
        if (!namesake) {
            return { kind: "settled" };
        }
        return namesake.signedIn
            ? { kind: "taken", by: namesake }
            : { kind: "returning", to: namesake };
    }

    /**
     *  Adopts another device's row for this installation, keeping its history.
     *
     *  @param device the row to take over
     *  @return true when the account accepted it
     */
    public async takeOver(device: UserDeviceDto): Promise<boolean> {
        const result = await this.apiClient.takeOverDevice(device.id);
        if (result.outcome !== "success") {
            this.LOG.warn("takeOver", `Not applied: ${result.message}`);
            return false;
        }
        await this.sessions.rememberDeviceId(device.id);
        this.LOG.log("takeOver", `This installation now holds device ${device.id}`);
        return true;
    }

    /**
     *  Changes what this installation's own row is called.
     *
     *  @param name the new label
     *  @return true when the account accepted it
     */
    public async renameThisDevice(name: string): Promise<boolean> {
        const deviceId = this.sessions.getSession()?.deviceId;
        if (!deviceId) {
            return false;
        }
        const result = await this.apiClient.renameDevice(deviceId, name);
        if (result.outcome !== "success") {
            this.LOG.warn("renameThisDevice", `Not applied: ${result.message}`);
            return false;
        }
        return true;
    }

    /**
     *  Finds another device of this account carrying the chosen name.
     *
     *  This installation's own row is excluded, which is the whole reason the sign-in response
     *  reports it: the row was created moments ago carrying exactly the name being checked, so
     *  without excluding it every chosen name would look taken by itself.
     *
     *  @param devices    the account's device list
     *  @param session    the signed-in session, naming this installation's row
     *  @param chosenName the name the user typed
     *  @return the other device, or undefined when the name is free
     */
    private findNamesake(
        devices: readonly UserDeviceDto[],
        session: SyncSession,
        chosenName: string
    ): UserDeviceDto | undefined {

        const wanted = this.comparable(chosenName);

        return devices
            .filter(device => device.id !== session.deviceId)
            .filter(device => this.comparable(device.deviceName) === wanted)
            // Most recently used first, so "the device you mean" is the one offered when an
            // account has somehow collected several of the same name.
            .sort((one, other) => other.lastUsedAt.localeCompare(one.lastUsedAt))[0];
    }

    /** Names are display text, so they are compared the way a person would compare them. */
    private comparable(value: string): string {
        return value.trim().toLowerCase();
    }
}
