import {AppStateRepository} from "../../backend/repository/AppStateRepository";
import {FirstRunViewModel} from "../../viewModel/firstRunViewModel"
import {SyncAccountViewModel} from "../../viewModel/syncAccountViewModel"
import {
    ACT_FIRST_RUN_CONNECT_CODE,
    ACT_FIRST_RUN_LOG_IN,
    ACT_FIRST_WORKSPACE,
    ACT_IMPORT_LINKS,
    ACT_LOAD_DEFAUTLS
} from "../../constants"
import {InputDialog} from "../partials/inputDialog";
import { MAX_NAME_LENGTH } from "../../backend/sync/SyncContracts";
import { t } from "../../i18n/i18n";

export class FirstRunComponent extends HTMLElement {

    private REPOSITORY!: AppStateRepository;
    private VIEW_MODEL!: FirstRunViewModel;
    private ACCOUNT_VIEW_MODEL!: SyncAccountViewModel;

    private addWorkspaceDialog: InputDialog = new InputDialog(
        t("workspace.addDialog.title"),
        {
            [t("workspace.addDialog.name")]:
                { type: "string", required: true, maxLength: MAX_NAME_LENGTH,
                  key: "workspaceName" }
        },
        ({ workspaceName }) => this.VIEW_MODEL.addWorkspace(
            workspaceName, t("firstRun.defaultWorkspaceDescription")));

    // "Device name" is optional and last, so the required fields stay where the eye starts.
    // Leaving it blank keeps the automatic label; it earns its place only for somebody running
    // several browsers on one machine, where the automatic labels are all identical.
    private connectCodeDialog: InputDialog = new InputDialog(
        t("sync.syncCodeDialog.title"),
        {
            [t("sync.syncCodeDialog.connectCode")]:
                { type: "string", required: true, key: "connectCode" },
            [t("dialogs.fields.deviceName")]:
                { type: "string", maxLength: MAX_NAME_LENGTH, key: "deviceName" }
        },
        ({ connectCode, deviceName }) => this.connectAccount(connectCode, deviceName));

    private logInDialog: InputDialog = new InputDialog(
        t("sync.logInDialog.title"),
        {
            [t("sync.logInDialog.usernameOrEmail")]:
                { type: "string", required: true, key: "usernameOrEmail" },
            [t("sync.logInDialog.password")]:
                { type: "password", required: true, key: "password" },
            [t("dialogs.fields.deviceName")]:
                { type: "string", maxLength: MAX_NAME_LENGTH, key: "deviceName" }
        },
        ({ usernameOrEmail, password, deviceName }) =>
            this.logIn(usernameOrEmail, password, deviceName));

    initialize(repository: AppStateRepository): void {
        this.REPOSITORY = repository;
        this.VIEW_MODEL = new FirstRunViewModel(this.REPOSITORY);
        this.ACCOUNT_VIEW_MODEL = new SyncAccountViewModel();
        this.ACCOUNT_VIEW_MODEL.initialize();
    }

    connectedCallback() {
       this.start();
    }

    start(): void {
        this.render();
        this.attachButtonActions();
    }

    public render(): void {

        const template: string = `
            <h1>${t("firstRun.heading")}</h1>
            <br>
            <h2>${t("firstRun.subheading")}</h2>
            <br><br>
            <div>
                <h3>${t("firstRun.createWorkspace")}</h3>
                <br>
                <button id="${ACT_FIRST_WORKSPACE}"> ${t("firstRun.createWorkspaceButton")}</button>
            </div>
            <br>
            <div>
                <h3>${t("firstRun.importPrompt")}</h3>
                <br>
                <button id="${ACT_IMPORT_LINKS}"> ${t("firstRun.importButton")}</button>
            </div>
            <br>
            <div>
                <h3>${t("firstRun.examplesPrompt")}</h3>
                <br>
                <button id="${ACT_LOAD_DEFAUTLS}"> ${t("firstRun.examplesButton")}</button>
            </div>
            <br>
            ${this.renderAccountSection()}
        `;

        this.innerHTML = template;
    }

    /**
     *  The account entry point.
     *
     *  It has to live here as well as in the application menu: the menu is drawn by the
     *  workspace header, and this screen replaces the workspace entirely. Without this an
     *  empty install could not reach its own account, which is precisely the install that
     *  most needs to - the one with nothing in it yet.
     */
    private renderAccountSection(): string {

        const account = this.ACCOUNT_VIEW_MODEL.observables.account.get();

        if (account.signedIn) {
            return `
                <div>
                    <h3>${t("firstRun.signedInAs", { username: account.username ?? "" })}</h3>
                </div>
            `;
        }

        return `
            <div>
                <h3>${t("firstRun.accountPrompt")}</h3>
                <br>
                <button id="${ACT_FIRST_RUN_CONNECT_CODE}"> &gt; ${t("sync.menu.enterSyncCode")}</button>
                <button id="${ACT_FIRST_RUN_LOG_IN}"> &gt; ${t("sync.menu.logIn")}</button>
            </div>
        `;
    }

    private attachButtonActions() {

        const addFirstWorkspaceButton = this.querySelector<HTMLButtonElement>(`#${ACT_FIRST_WORKSPACE}`);
        const importButton = this.querySelector<HTMLButtonElement>(`#${ACT_IMPORT_LINKS}`);
        const loadDefaultsButton = this.querySelector<HTMLButtonElement>(`#${ACT_LOAD_DEFAUTLS}`);

        if (!addFirstWorkspaceButton) {
            console.error(`Cannot find button for action ${ACT_FIRST_WORKSPACE}`);
        }

        addFirstWorkspaceButton!.addEventListener('click', () => {
            this.addWorkspaceDialog.show();
        });

        importButton!.addEventListener('click', () => {
            this.VIEW_MODEL.importProfile();
        });

        loadDefaultsButton!.addEventListener('click', () => {
            this.VIEW_MODEL.loadDefaults();
        });

        // Both are absent once the user is signed in, so neither is asserted.
        this.querySelector<HTMLButtonElement>(`#${ACT_FIRST_RUN_CONNECT_CODE}`)
            ?.addEventListener('click', () => this.connectCodeDialog.show());

        this.querySelector<HTMLButtonElement>(`#${ACT_FIRST_RUN_LOG_IN}`)
            ?.addEventListener('click', () => this.logInDialog.show());
    }

    /** Redeems the code from the website's devices page, then shows what arrived. */
    private async connectAccount(
        code: string | null,
        deviceName?: string | null
    ): Promise<void> {
        await this.ACCOUNT_VIEW_MODEL.connectWithCode(code, deviceName);
        this.restartIfSignedIn();
    }

    /** Signs in with a password, then shows what arrived. */
    private async logIn(
        usernameOrEmail: string | null,
        password: string | null,
        deviceName?: string | null
    ): Promise<void> {
        await this.ACCOUNT_VIEW_MODEL.logIn(usernameOrEmail, password, deviceName);
        this.restartIfSignedIn();
    }

    /**
     *  Reloads once a sign-in has actually landed, the same way every other action on this
     *  screen ends. The reload is what lets the workspace take over: start-up pulls the
     *  account's data down, so by the time the page comes back there is an environment to
     *  render and this screen is no longer the one shown.
     */
    private restartIfSignedIn(): void {
        if (this.ACCOUNT_VIEW_MODEL.observables.account.get().signedIn) {
            window.location.reload();
        }
    }

}