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
import { signInDeviceFields, wantsSync } from "../partials/signInFields";
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

    // The last two fields - synchronise, device name - are `signInDeviceFields`, shared by
    // every sign-in dialog.
    private connectCodeDialog: InputDialog = new InputDialog(
        t("sync.syncCodeDialog.title"),
        {
            [t("sync.syncCodeDialog.connectCode")]:
                { type: "string", required: true, key: "connectCode" },
            ...signInDeviceFields()
        },
        () => void this.finishSignIn(),
        ({ connectCode, deviceName, synchronise }) =>
            this.ACCOUNT_VIEW_MODEL.connectWithCode(
                connectCode, deviceName, wantsSync(synchronise)));

    private logInDialog: InputDialog = new InputDialog(
        t("sync.logInDialog.title"),
        {
            [t("sync.logInDialog.usernameOrEmail")]:
                { type: "string", required: true, key: "usernameOrEmail" },
            [t("sync.logInDialog.password")]:
                { type: "password", required: true, key: "password" },
            ...signInDeviceFields()
        },
        () => void this.finishSignIn(),
        ({ usernameOrEmail, password, deviceName, synchronise }) =>
            this.ACCOUNT_VIEW_MODEL.logIn(
                usernameOrEmail, password, deviceName, wantsSync(synchronise)));

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

    /**
     *  Draws the screen out of elements, never out of an HTML string.
     *
     *  It used to be a template assigned to innerHTML, with the signed-in username
     *  interpolated into it unescaped - a name the account holder chose, inserted as markup on
     *  an extension page. Every piece of text here goes in through textContent, so whatever it
     *  contains is shown, not parsed.
     */
    public render(): void {
        this.replaceChildren(
            heading("h1", t("firstRun.heading")),
            heading("h2", t("firstRun.subheading")),
            section(t("firstRun.createWorkspace"),
                button(ACT_FIRST_WORKSPACE, t("firstRun.createWorkspaceButton"))),
            section(t("firstRun.importPrompt"),
                button(ACT_IMPORT_LINKS, t("firstRun.importButton"))),
            section(t("firstRun.examplesPrompt"),
                button(ACT_LOAD_DEFAUTLS, t("firstRun.examplesButton"))),
            this.renderAccountSection());
    }

    /**
     *  The account entry point.
     *
     *  It has to live here as well as in the application menu: the menu is drawn by the
     *  workspace header, and this screen replaces the workspace entirely. Without this an
     *  empty install could not reach its own account, which is precisely the install that
     *  most needs to - the one with nothing in it yet.
     */
    private renderAccountSection(): HTMLElement {

        const account = this.ACCOUNT_VIEW_MODEL.observables.account.get();

        if (account.signedIn) {
            return section(t("firstRun.signedInAs", { username: account.username ?? "" }));
        }

        return section(t("firstRun.accountPrompt"),
            button(ACT_FIRST_RUN_CONNECT_CODE, `> ${t("sync.menu.enterSyncCode")}`),
            button(ACT_FIRST_RUN_LOG_IN, `> ${t("sync.menu.logIn")}`));
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

    /**
     *  Once a sign-in dialog has closed - which it does only when the sign-in worked or was
     *  refused over the devices limit - settles what follows, then shows what arrived.
     */
    private async finishSignIn(): Promise<void> {
        await this.ACCOUNT_VIEW_MODEL.finishSignIn();
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

/** A heading holding plain text. */
function heading(tag: "h1" | "h2" | "h3", text: string): HTMLElement {
    const element = document.createElement(tag);
    element.textContent = text;
    return element;
}

/** A button with the identifier its action is found by, and a plain-text label. */
function button(id: string, label: string): HTMLButtonElement {
    const element = document.createElement("button");
    element.id = id;
    element.textContent = label;
    return element;
}

/** One block of the screen: a sentence, and the buttons that answer it. */
function section(prompt: string, ...buttons: HTMLButtonElement[]): HTMLElement {
    const element = document.createElement("div");
    element.classList.add("first-run__section");
    element.append(heading("h3", prompt), ...buttons);
    return element;
}
