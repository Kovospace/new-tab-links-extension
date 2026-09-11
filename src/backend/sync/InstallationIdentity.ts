import { ChromeStorageWrapper } from "../datasource/chromeStorage/chromeStorageWrapper";
import { uid } from "../repository/AppStateRepositoryUtils";
import { Logger } from "../../utils/logger";

import { INSTALLATION_NAME_KEY } from "../datasource/chromeStorage/storageKeys";

const INSTALLATION_ID_KEY = "sync_installation_id";

/**
 *  Identity of THIS installation of the extension — one UUID, minted on first use and kept
 *  in chrome.storage.local for as long as the extension stays installed.
 *
 *  It is not a user identity and it survives signing in and out: two browsers signed into
 *  the same account are two installations. It goes to the backend as "originDeviceId" on every
 *  pushed change, so that the change notification the backend broadcasts back can be recognised
 *  as this device's own echo and ignored, and in X-Installation-Id whenever tokens are issued,
 *  which is what the backend keys a device on.
 *
 *  It also carries the name the user chose for this installation, if any. That is deliberately
 *  optional: the automatic label is enough for somebody with one browser, and only a person
 *  running several on one machine has anything to gain from telling them apart. The name is a
 *  label and nothing more - it identifies nothing, so two installations may share one.
 */
export class InstallationIdentity {

    private LOG!: Logger;
    private datasource = new ChromeStorageWrapper();
    private installationId: string | null = null;
    private name: string | null = null;

    /**
     *  Loads the stored identifier, minting and persisting one when this is a fresh install.
     *  Must be awaited before getInstallationId() is called.
     */
    public async init(): Promise<string> {
        this.LOG = new Logger("InstallationIdentity");
        this.name = await this.datasource.get<string>(INSTALLATION_NAME_KEY);
        const stored = await this.datasource.get<string>(INSTALLATION_ID_KEY);
        if (stored) {
            this.installationId = stored;
            this.LOG.debug("init", `Existing installation id: ${stored}`);
            return stored;
        }
        const minted = uid();
        await this.datasource.save(INSTALLATION_ID_KEY, minted);
        this.installationId = minted;
        this.LOG.debug("init", `Minted new installation id: ${minted}`);
        return minted;
    }

    /**
     *  The name the user gave this installation, or null when they did not give one.
     *
     *  Read on every request, so it is held in memory rather than fetched from storage.
     */
    public getName(): string | null {
        return this.name;
    }

    /**
     *  Names this installation, or forgets the name when given nothing.
     *
     *  A blank name is stored as no name at all rather than as an empty label, so that clearing
     *  the field in the sign-in dialog puts the automatic label back instead of leaving a device
     *  called "".
     *
     *  @param chosenName what the user typed, which may be empty or only spaces
     */
    public async setName(chosenName: string | null | undefined): Promise<void> {
        const trimmed = chosenName?.trim() ?? "";
        this.name = trimmed.length > 0 ? trimmed : null;
        await this.datasource.save(INSTALLATION_NAME_KEY, this.name);
        this.LOG.debug("setName", this.name ? `Installation named ${this.name}` : "Name cleared");
    }

    /**
     *  @throws Error when init() has not been awaited — callers must not invent an id.
     */
    public getInstallationId(): string {
        if (!this.installationId) {
            throw new Error("InstallationIdentity.init() has to be awaited before use");
        }
        return this.installationId;
    }
}

export const installationIdentity = new InstallationIdentity();
