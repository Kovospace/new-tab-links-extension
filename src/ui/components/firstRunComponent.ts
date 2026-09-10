import {AppStateRepository} from "../../backend/repository/AppStateRepository";
import {FirstRunViewModel} from "../../viewModel/firstRunViewModel"
import {SyncAccountViewModel} from "../../viewModel/syncAccountViewModel"
import {
    ACT_FIRST_RUN_CONNECT_CODE,
    ACT_FIRST_RUN_LOG_IN,
    ACT_FIRST_WORKSPACE,
    ACT_IMPORT_LINKS,
    ACT_LOAD_DEFAUTLS
} from "../../main"
import {InputDialog} from "../partials/inputDialog";
import { MAX_NAME_LENGTH } from "../../backend/sync/SyncContracts";

export class FirstRunComponent extends HTMLElement {

    private REPOSITORY!: AppStateRepository;
    private VIEW_MODEL!: FirstRunViewModel;
    private ACCOUNT_VIEW_MODEL!: SyncAccountViewModel;

    private addWorkspaceDialog: InputDialog = new InputDialog(
        "Add workspace",
        { "Workspace name": { type: "string", required: true, maxLength: MAX_NAME_LENGTH } },
        ({ workspaceName }) => this.VIEW_MODEL.addWorkspace(workspaceName, "Default workspace"));

    // "Device name" is optional and last, so the required fields stay where the eye starts.
    // Leaving it blank keeps the automatic label; it earns its place only for somebody running
    // several browsers on one machine, where the automatic labels are all identical.
    private connectCodeDialog: InputDialog = new InputDialog(
        "Enter sync code",
        {
            "Connect code": { type: "string", required: true },
            "Device name": { type: "string", maxLength: MAX_NAME_LENGTH }
        },
        ({ connectCode, deviceName }) => this.connectAccount(connectCode, deviceName));

    private logInDialog: InputDialog = new InputDialog(
        "Log in",
        {
            "Username or email": { type: "string", required: true },
            "Password": { type: "password", required: true },
            "Device name": { type: "string", maxLength: MAX_NAME_LENGTH }
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
            <h1>No workspaces & Groups & Links here yet.</h1>
            <br>
            <h2>If You se this page, it is either first run or everything was wiped out.</h2>
            <br><br>
            <div>
                <h3>Start by creating Workspace</h3>
                <br>
                <button id="${ACT_FIRST_WORKSPACE}"> + Add first workspace</button>
            </div>
            <br>
            <div>
                <h3>... or load links from backup / exported file</h3>
                <br>
                <button id="${ACT_IMPORT_LINKS}"> &gt; Import</button>
            </div>
            <br>
            <div>
                <h3>... or load predefined examples set</h3>
                <br>
                <button id="${ACT_LOAD_DEFAUTLS}"> - Load examples</button>
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
                    <h3>Signed in as ${account.username}</h3>
                </div>
            `;
        }

        return `
            <div>
                <h3>... or bring in the links you already have in your NewTabLinks account</h3>
                <br>
                <button id="${ACT_FIRST_RUN_CONNECT_CODE}"> &gt; Enter sync code</button>
                <button id="${ACT_FIRST_RUN_LOG_IN}"> &gt; Log in</button>
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