import { ChromeStorageWrapper } from "../datasource/chromeStorage/chromeStorageWrapper";
import { uid } from "../repository/AppStateRepositoryUtils";
import { Logger } from "../../utils/logger";

const INSTALLATION_ID_KEY = "sync_installation_id";

/**
 *  Identity of THIS installation of the extension — one UUID, minted on first use and kept
 *  in chrome.storage.local for as long as the extension stays installed.
 *
 *  It is not a user identity and it survives signing in and out: two browsers signed into
 *  the same account are two installations. Later increments send it to the backend as
 *  "originDeviceId" on every pushed change, so that the change notification the backend
 *  broadcasts back can be recognised as this device's own echo and ignored.
 */
export class InstallationIdentity {

    private LOG!: Logger;
    private datasource = new ChromeStorageWrapper();
    private installationId: string | null = null;

    /**
     *  Loads the stored identifier, minting and persisting one when this is a fresh install.
     *  Must be awaited before getInstallationId() is called.
     */
    public async init(): Promise<string> {
        this.LOG = new Logger("InstallationIdentity");
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
