import {
    ELEM_GROUP,
    ELEM_WORKSPACE_BODY,
    ELEM_WORKSPACE_HEAD,
    ACT_SWITCH_WORKSPACE,
    ACT_ADD_GROUP,
    ACT_EDIT_WORKSPACE,
    ACT_ADD_WORKSPACE,
    CLASS_WORKSPACE_HEAD_TITLE,
    CLASS_WORKSPACE_HEAD_ACTIONS,
    CLASS_SIGNED_OUT_NOTICE, CLASS_WORKSPACE_SYNC_NOTICE,
    CLASS_ACTION_ADD, CLASS_WORKSPACE_HEADER_LEFT, CLASS_WORKSPACE_HEADER_RIGHT, ACT_EDIT_GROUP, ACT_APP_MENU,
    ACT_USER_PROFILES, CLASS_ACTION_ACTIVE, CLASS_ACTION_HIGHLIGHT, ACT_CLOSED_TABS, ELEM_WORKSPACE_FOOTER,
} from "../../constants"

// data/model layer
import { WorkspaceDTO, GroupDTO, ProfileDTO } from "../../viewModel/abstract/dtos";
import { GroupViewModel } from "../../viewModel/groupViewModel";
import { WorkspaceViewModel } from "../../viewModel/workspaceViewModel";
import { AccountDTO, logInRequests$, SyncAccountViewModel } from "../../viewModel/syncAccountViewModel";
import { syncStateViewModel } from "../../viewModel/syncStateViewModel";

// components layer
import { AbstractComponent } from "../abstract/abstractComponent";
import { GroupComponent } from "./groupComponent";
import { OptionsMenu, OptionsMenuItem } from "../partials/optionsMenu"

// utils
import { ICON, renderContainer, renderButton, renderTextContainer } from "../partials/wrappedHtmlElements"
import { handleReactiveRendering } from "../utils/rendering"
import { toggleActiveClassOnSpecificAttribute } from "../utils/elementsAttributesManipulation";
import {InputDialog} from "../partials/inputDialog";
import {MAX_DESCRIPTION_LENGTH, MAX_NAME_LENGTH} from "../../backend/sync/SyncContracts";
import {ProfileManagerDialog} from "../partials/profileManagerDialog";
import {SettingsDialog} from "../partials/settingsDialog";
import {TipsBar} from "../partials/tipsBar";
import {AdsBar} from "../partials/adsBar";
import {ClosedTabsPanel} from "../partials/closedTabsPanel";
import {SearchBar} from "../partials/searchBar";
import { t } from "../../i18n/i18n";

export class WorkspaceComponent extends AbstractComponent<WorkspaceDTO, WorkspaceViewModel> {

    private currentWorkspaceId: string = "";

    /** The recently closed tabs rail, and the button that holds it open. */
    private closedTabsPanel: ClosedTabsPanel | null = null;
    private closedTabsButton: HTMLButtonElement | null = null;

    /** The search bar in the heading; one element, moved into every redraw of the heading. */
    private searchBar: SearchBar = new SearchBar();

    /**
     *  "Signed out of {username}", last in the workspace head - pushed to its right end - while
     *  nobody is signed in and the links on screen belong to an account. One element for the page's lifetime, like the search
     *  bar: the head is redrawn whenever the workspace changes, and the notice is shown or hidden
     *  from the account state rather than rebuilt with it.
     */
    private signedOutNotice: HTMLElement = this.buildSignedOutNotice();

    /**
     *  Why the open workspace does not synchronise - example data, no free slot, over a Fair
     *  Use cap - where the signed-out notice sits, with buttons to the website's account page
     *  (upgrade) and devices page (audit). One element for the page's lifetime, like that one.
     */
    private workspaceSyncNotice: HTMLElement = this.buildWorkspaceSyncNotice();

    /** Account section of the application menu; not tied to AppState, hence its own view model. */
    private accountViewModel: SyncAccountViewModel = new SyncAccountViewModel();

    // "Device name" is optional and last, so the required fields stay where the eye starts.
    // Leaving it blank keeps the automatic label; it earns its place only for somebody running
    // several browsers on one machine, where the automatic labels are all identical.
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
            this.accountViewModel.logIn(usernameOrEmail, password, deviceName));

    // the field is labelled the way the website labels it ("Your connect code"), so the user
    // recognises what to paste, while the menu entry keeps the wording of the sync feature
    private syncCodeDialog: InputDialog = new InputDialog(
        t("sync.syncCodeDialog.title"),
        {
            [t("sync.syncCodeDialog.connectCode")]:
                { type: "string", required: true, key: "connectCode" },
            [t("dialogs.fields.deviceName")]:
                { type: "string", maxLength: MAX_NAME_LENGTH, key: "deviceName" }
        },
        ({ connectCode, deviceName }) =>
            this.accountViewModel.connectWithCode(connectCode, deviceName));

    private addWorkspaceDialog: InputDialog = new InputDialog(
        t("workspace.addDialog.title"),
        {
            [t("workspace.addDialog.name")]:
                { type: "string", required: true, maxLength: MAX_NAME_LENGTH,
                  key: "workspaceName" },
            [t("workspace.addDialog.description")]:
                { type: "string", maxLength: MAX_DESCRIPTION_LENGTH, key: "workspaceTitle" }
        },
        ({ workspaceName, workspaceTitle }) =>
          this.VIEW_MODEL.addWorkspace(workspaceName, workspaceTitle));

    private createProfileDialog: InputDialog = new InputDialog(
        t("profiles.createDialog.title"),
        {
            [t("profiles.createDialog.name")]:
                { type: "string", required: true, maxLength: MAX_NAME_LENGTH,
                  key: "profileName" }
        },
        ({ profileName }) => this.VIEW_MODEL.createProfile(profileName));

    private addGroupDialog: InputDialog = new InputDialog(
        t("group.addDialog.title"),
        {
            [t("group.addDialog.name")]:
                { type: "string", required: true, maxLength: MAX_NAME_LENGTH,
                  key: "groupName" },
            [t("group.addDialog.description")]:
                { type: "string", maxLength: MAX_DESCRIPTION_LENGTH, key: "groupDescription" }
        },
        ({ groupName, groupDescription }) =>
          this.VIEW_MODEL.addGroup(this.currentWorkspaceId, groupName, groupDescription));

    render(parentElem: HTMLElement) {

        const headElem: HTMLElement = document.createElement(ELEM_WORKSPACE_HEAD);
        const bodyElem: HTMLElement = document.createElement(ELEM_WORKSPACE_BODY);
        const footElem: HTMLElement = document.createElement(ELEM_WORKSPACE_FOOTER);
        this.appendChild(headElem);
        this.appendChild(bodyElem);
        this.appendChild(footElem);

        // page header
        this.renderHeader();

        // page body - workspace titlebar
        this.VIEW_MODEL.observables.workspace
            .subscribe((workspace: WorkspaceDTO) => {
                // The observable starts unset and subscribe() replays whatever it holds, so a
                // view model that failed before its first set() would otherwise be dereferenced
                // here - which is the second half of the "reading 'id'" pair this screen threw.
                if (!workspace) return;
                this.id = workspace.id; // exception, because this is root template
                this.renderWorkspaceHead(headElem, workspace);
                bodyElem.replaceChildren();
                this.renderGroups(bodyElem, this.VIEW_MODEL.getGroups(workspace.id));
            });

        // page body - groups
        this.VIEW_MODEL.observables.groups
            .subscribe(groups => this.renderGroups(bodyElem, groups));

        // tips, under the columns and inside the scrolling area rather than in the page
        // footer: the footer never moves, and a line of advice that is always on screen
        // stops reading as advice and starts reading as furniture.
        this.renderTips(footElem);
        this.renderAdsBar(footElem);

        // The rail of recently closed tabs, which lives beside the page rather than in it.
        void this.renderClosedTabs();
    }

    attachListeners(parentElem: HTMLElement) {
        this.listenerChangeWorkspaceName();
    }

    private renderHeader() {
        const headerElem: HTMLElement = document.body.getElementsByTagName("header")[0];
        const headerElemLeftContent: HTMLElement = renderContainer([CLASS_WORKSPACE_HEADER_LEFT]);
        const headerElemRightContent: HTMLElement = renderContainer([CLASS_WORKSPACE_HEADER_RIGHT]);
        headerElem.appendChild(headerElemLeftContent);
        headerElem.appendChild(headerElemRightContent);

        // workspace buttons
        headerElemLeftContent.appendChild(renderTextContainer("span", t("header.workspaces")));
        headerElemLeftContent.appendChild(renderContainer([]));
        this.VIEW_MODEL.observables.workspaces
            .subscribe((workspaces: WorkspaceDTO[]) => this.renderWorkspaceSwitcher(headerElemLeftContent, workspaces));

        // add workspace button
        headerElemLeftContent.appendChild(renderButton(
            ICON.ADD,
            "",
            [ACT_ADD_WORKSPACE, CLASS_ACTION_ADD],
            t("header.addWorkspace"),
            onClick => {
                this.LOG.debug("renderWorkspaceSwitcherToolings", "add workspace clicked");
                this.addWorkspaceDialog.show();
            }
        ));

        // recently closed tabs, first on the right so it sits furthest from the menus: it is
        // reached far more often than they are, and it opens a panel rather than a menu.
        // Kept rather than appended and forgotten: it wears the "active" class while the panel
        // is being held open, and the panel can let go of itself - a click outside it unpins
        // it without this button hearing about the click.
        this.closedTabsButton = renderButton(
            // Its own glyph, not the import arrow: that one already means "import profile"
            // two items down in the menu beside it, and one symbol cannot mean both.
            ICON.HISTORY,
            "",
            [ACT_CLOSED_TABS],
            t("header.closedTabs"),
            () => this.toggleClosedTabsPinned()
        );
        headerElemRightContent.appendChild(this.closedTabsButton);

        // application / profiles menu — populated reactively via observables.profiles
        // headerElemRightContent.appendChild(renderTextContainer("span", "Profile"));

        const profilesMenu = new OptionsMenu(
            headerElemRightContent,
            {
                openMenuButtonId: `user-profiles`,
                openMenuButtonClass: [ACT_USER_PROFILES, CLASS_ACTION_HIGHLIGHT],
                openMenuButtonTooltipText: t("header.profilesMenu"),
                openMenuButtonContent: `...`
            },
            [],
            {}
        );

        let latestProfiles: ProfileDTO[] = [];
        const renderProfilesMenu = (profiles: ProfileDTO[]) => {
                latestProfiles = profiles;
                const active = profiles.find(p => p.active);
                profilesMenu.updateButtonContent(t("header.profileButton",
                    { name: active?.name ?? t("header.noProfile") }));
                profilesMenu.updateOptions([
                    ...profiles.map(p => ({
                        actionTitle: p.name,
                        active: p.active,
                        // The crossed-out sync mark, with why, on a profile that does not
                        // synchronise.
                        notSynced: syncStateViewModel.profileReason(p.id) ?? undefined,
                        onClick: () => this.VIEW_MODEL.switchProfile(p.id)
                    })),
                    {
                        separator: true
                    },
                    {
                        actionTitle: `${ICON.EXPORT} ${t("header.profileMenu.export")}`,
                        noBorder: true,
                        onClick: () => this.VIEW_MODEL.exportCurrentProfile()
                    },
                    {
                        actionTitle: `${ICON.IMPORT} ${t("header.profileMenu.import")}`,
                        noBorder: true,
                        onClick: () => this.VIEW_MODEL.importProfile()
                    },
                    {
                        actionTitle: `${ICON.ADD} ${t("header.profileMenu.create")}`,
                        noBorder: true,
                        onClick: () => this.createProfileDialog.show()
                    },
                    {
                        actionTitle: `${ICON.EDIT} ${t("header.profileMenu.manage")}`,
                        onClick: () => void new ProfileManagerDialog().show()
                    }
                ]);
            };
        this.VIEW_MODEL.observables.profiles.subscribe(renderProfilesMenu);
        // What synchronises is decided after each synchronisation, not when the list changes.
        syncStateViewModel.initialize();
        syncStateViewModel.changes$.subscribe(() => {
            renderProfilesMenu(latestProfiles);
            this.updateWorkspaceSyncNotice();
        });
        // A limit's notice on an installation nobody is signed in to offers logging in.
        let logInReplayed = false;
        logInRequests$.subscribe(() => {
            if (logInReplayed) {
                this.logInDialog.show();
            }
            logInReplayed = true;
        });

        // application / user account menu - rebuilt reactively from the sync session
        const accountMenu = new OptionsMenu(
            headerElemRightContent,
            {
                openMenuButtonId: `application-menu`,
                openMenuButtonClass: ACT_APP_MENU,
                openMenuButtonTooltipText: t("header.applicationMenu")
            },
            [],
            {}
        );

        this.accountViewModel.initialize();
        this.accountViewModel.observables.account
            .subscribe((account: AccountDTO) => {
                accountMenu.updateOptions(
                    account.signedIn
                        ? this.buildSignedInAccountMenuItems(account)
                        : this.buildSignedOutAccountMenuItems());
                this.updateSignedOutNotice(account);
            });
    }

    /** The notice's element, hidden until there is an account to have been signed out of. */
    private buildSignedOutNotice(): HTMLElement {
        const noticeElem: HTMLElement = renderContainer([CLASS_SIGNED_OUT_NOTICE]);
        noticeElem.hidden = true;
        noticeElem.title = t("sync.signedOutNotice.tooltip");
        noticeElem.appendChild(renderTextContainer("span", ""));
        noticeElem.appendChild(renderButton(
            t("sync.menu.logIn"),
            "",
            [],
            t("sync.menu.logIn"),
            () => this.logInDialog.show()
        ));
        return noticeElem;
    }

    /** The workspace sync notice's element: its text, and the two ways on. */
    private buildWorkspaceSyncNotice(): HTMLElement {
        const noticeElem: HTMLElement = renderContainer([CLASS_WORKSPACE_SYNC_NOTICE]);
        noticeElem.hidden = true;
        noticeElem.appendChild(renderTextContainer("span", ""));
        noticeElem.appendChild(renderButton(
            t("sync.unsynced.upgrade"), "", [], t("sync.unsynced.upgradeTooltip"),
            () => this.accountViewModel.openAccountSettingsPage()));
        noticeElem.appendChild(renderButton(
            t("sync.unsynced.audit"), "", [], t("sync.unsynced.auditTooltip"),
            () => this.accountViewModel.openDevicesPage()));
        return noticeElem;
    }

    /** Shows why the open workspace does not synchronise, or hides the notice when it does. */
    private updateWorkspaceSyncNotice(): void {
        const notice = this.id ? syncStateViewModel.workspaceNotice(this.id) : null;
        this.workspaceSyncNotice.hidden = notice === null;
        const textElem = this.workspaceSyncNotice.querySelector("span");
        if (textElem) {
            textElem.textContent = notice?.text ?? "";
        }
        this.workspaceSyncNotice.querySelectorAll("button").forEach(button => {
            button.hidden = !notice?.offerWaysOn;
        });
    }

    /**
     *  Shows the notice while the links on screen belong to an account nobody is signed in to.
     *
     *  @param account the account state, whose signedOutOf names that account
     */
    private updateSignedOutNotice(account: AccountDTO): void {
        this.signedOutNotice.hidden = account.signedOutOf === null;
        const textElem = this.signedOutNotice.querySelector("span");
        if (textElem) {
            textElem.textContent = account.signedOutOf === null
                ? ""
                : t("sync.signedOutNotice.text", { username: account.signedOutOf });
        }
    }

    /**
     *  Application menu while no account is connected: the three ways of getting one.
     */
    private buildSignedOutAccountMenuItems(): OptionsMenuItem[] {
        return [
            {
                actionTitle: t("sync.menu.logIn"),
                onClick: () => this.logInDialog.show()
            },
            {
                actionTitle: t("sync.menu.register"),
                onClick: () => this.accountViewModel.openRegistrationPage()
            },
            {
                actionTitle: t("sync.menu.enterSyncCode"),
                onClick: () => this.syncCodeDialog.show()
            },
            ...this.settingsMenuItems()
        ];
    }

    /**
     *  Application menu while an account is connected. The first entry is a label naming the
     *  signed-in user, not an action. Logging out stops synchronising and keeps every link.
     */
    private buildSignedInAccountMenuItems(account: AccountDTO): OptionsMenuItem[] {
        return [
            {
                actionTitle: `${ICON.USER} ${account.username}`,
                noBorder: true,
                onClick: () => {}
            },
            {
                actionTitle: account.syncStatus ?? "",
                noBorder: true,
                onClick: () => {}
            },
            // Offered only to an account that does not have it yet.
            ...(account.premium ? [] : [{
                actionTitle: t("sync.menu.upgradeToPremium"),
                onClick: () => this.accountViewModel.openAccountSettingsPage()
            }]),
            {
                actionTitle: t("sync.menu.logOut"),
                onClick: () => this.accountViewModel.logOut()
            },
            ...this.settingsMenuItems()
        ];
    }

    /**
     *  Settings, last in the application menu whichever way that menu is built.
     *
     *  Last and behind a separator because it is the only entry there that is not about the
     *  account - and it is written once rather than at the end of both menus, so it cannot
     *  end up in two places or, worse, in only one of them.
     */
    private settingsMenuItems(): OptionsMenuItem[] {
        return [
            { separator: true },
            {
                actionTitle: t("sync.menu.settings"),
                onClick: () => new SettingsDialog().show()
            }
        ];
    }

    /**
     * Top menu workspace switcher content (Application header content)
     *
     * Parent to inflate:
     *
     *  <header>
     *      ...
     *      <div>[[ workspace switcher ]]</div>
     *      ...
     *  </header>
     */
    private renderWorkspaceSwitcher(parentElem: HTMLElement, workspaces: WorkspaceDTO[]): void {

        // workspaces switcher
        handleReactiveRendering<WorkspaceDTO, HTMLButtonElement, "value">(
            parentElem.getElementsByTagName("div")[0],
            workspaces,
            workspace => workspace.id,
            workspace => renderButton(
                workspace.title,
                workspace.id,
                [ACT_SWITCH_WORKSPACE],
                "",
                clicked => {
                    this.LOG.debug(
                        "renderWorkspaceSwitcher",
                        "workspace switch to workspace: " + workspace.title + " with id: " + workspace.id + " clicked");
                    this.VIEW_MODEL.setCurrentWorkspace(workspace.id);
                }
            ),
            "value"
        );

        // switch active class idependently because other sources like human action can trigger this render
        if (!workspaces) {
            return;
        }
        const activeWorkspace: WorkspaceDTO | undefined =  workspaces
            .find((workspace: WorkspaceDTO) => workspace.active);
        if (!activeWorkspace) {
            return;
        }
        toggleActiveClassOnSpecificAttribute<HTMLButtonElement, "value">("value", activeWorkspace.id, ACT_SWITCH_WORKSPACE);
    }

    /**
     *  Workspace heading
     */
    private renderWorkspaceHead(parentElem: HTMLElement, workspace: WorkspaceDTO) {

        const titleSectionElem: HTMLElement = renderContainer([CLASS_WORKSPACE_HEAD_TITLE]);
        const actionsSectionElem: HTMLElement = renderContainer([CLASS_WORKSPACE_HEAD_ACTIONS]);

        // title
        titleSectionElem.appendChild(renderTextContainer("h1", workspace.title));
        titleSectionElem.appendChild(renderTextContainer("span", workspace.description));

        // edit workspace screen
        new OptionsMenu(
            actionsSectionElem,
            {
                openMenuButtonId: `workpsace-${this.id}-menu`,
                openMenuButtonTooltipText: t("workspace.menu.tooltip"),
                openMenuButtonClass: ACT_EDIT_WORKSPACE
            },
            [
                {
                    actionTitle: t("workspace.menu.add"),
                    onClick: () => this.actionAddGroup(workspace.id)
                },
                {
                    actionTitle: t("workspace.menu.editTitle"),
                    onClick: () => this.toggleWorkspaceTitleEditable(event?.target as HTMLElement)
                },
                {
                    actionTitle: t("workspace.menu.delete"),
                    dangerous: true,
                    dangerConfirmation: t("workspace.menu.deleteConfirmation"),
                    onClick: () => this.VIEW_MODEL.deleteWorkspace(this.id)
                }
            ],
            {
                workspaceId: this.id
            }
        );

        // add group
        actionsSectionElem.appendChild(renderButton(
            `${ICON.ADD} ${t("workspace.addGroup")}`,
            workspace.id,
            [ACT_ADD_GROUP, CLASS_ACTION_ADD],
            t("workspace.addGroupTooltip"),
            (event) => this.actionAddGroup(workspace.id)
        ));

        // The search bar is the same element on every redraw rather than a new one, so that
        // renaming or switching the workspace does not throw away a query half typed.
        parentElem.replaceChildren(
            titleSectionElem,
            actionsSectionElem,
            this.searchBar.element(),
            this.signedOutNotice,
            this.workspaceSyncNotice
        );
        this.updateWorkspaceSyncNotice();

        // reattach listeners because child elements of workspace heading was replaced
        this.listenerChangeWorkspaceName();
    }

    /**
     *  Workspace's groups with links and subgroups containers
     */
    private renderGroups(parentElem: HTMLElement, groups: GroupDTO[]) {

        handleReactiveRendering<GroupDTO, HTMLElement, "id">(
            parentElem,
            groups,
            group => group.id,
            (group: GroupDTO) => {
                const groupElem = document.createElement(ELEM_GROUP) as GroupComponent;
                groupElem.initialize(this.REPOSITORY, group, GroupViewModel);
                return groupElem;
            }
        );
    }

    /**
     *  The tips, at the bottom of the workspace plane.
     *
     *  Inside the plane rather than in the page footer, which is pinned: they belong to the
     *  columns screen and scroll with it. The plane is a column that stretches to the height
     *  of the scrolling area, so the bar sits at the bottom of the empty space when there is
     *  little to show, and below the columns when there is a lot - see the stylesheet, where
     *  `margin-top: auto` does that.
     */
    private renderTips(parentElem: HTMLElement) {
        new TipsBar().render(parentElem);
    }

    /** The space an advertisement goes in, under the tips. */
    private renderAdsBar(parentElem: HTMLElement): void {
        new AdsBar().render(parentElem);
    }

    /**
     *  The recently closed tabs rail, drawn with the page rather than on demand.
     *
     *  It has to be there to be hovered, which is the whole of its design: it widens when the
     *  pointer reaches it and costs no click. That means paying for it on every new tab -
     *  one read of a storage key and two subscriptions - which is the price of the panel
     *  being useful in passing rather than after a decision to go and look.
     */
    private async renderClosedTabs(): Promise<void> {
        this.closedTabsPanel = new ClosedTabsPanel();
        // Subscribing fires immediately, which is what puts the button in its resting state.
        this.closedTabsPanel.pinned$.subscribe(pinned =>
            this.closedTabsButton?.classList.toggle(CLASS_ACTION_ACTIVE, pinned));
        await this.closedTabsPanel.render(document.body);
    }

    /** Holds the rail open, or lets it go back to widening on hover. */
    private toggleClosedTabsPinned(): void {
        this.closedTabsPanel?.togglePinned();
    }

    private toggleWorkspaceTitleEditable(menuItem: HTMLElement) {

        const titleAndDescParentContainer = this.getElementsByClassName(CLASS_WORKSPACE_HEAD_TITLE)[0];
        const titleElem = titleAndDescParentContainer.querySelectorAll(":scope > h1")[0];
        const descriptionElem = titleAndDescParentContainer.querySelectorAll(":scope > span")[0];

        menuItem.classList.toggle("active");
        titleElem.toggleAttribute('contentEditable');
        titleElem.classList.toggle("editable");
        descriptionElem.toggleAttribute('contentEditable');
        descriptionElem.classList.toggle("editable");
        if (menuItem.classList.contains("active")) {
            setTimeout(() => { menuItem.textContent = t("workspace.menu.saveTitle") }, 250);
        } else {
            setTimeout(() => { menuItem.textContent = menuItem.getAttribute('defaultText') }, 250);
        }
    }

    private actionAddGroup(workspaceId: string): void {
        this.LOG.debug("add group clicked");
        this.currentWorkspaceId = workspaceId;
        this.addGroupDialog.show();
    }

    private listenerChangeWorkspaceName() {

        const titleAndDescParentContainer = this.getElementsByClassName(CLASS_WORKSPACE_HEAD_TITLE)[0];
        const titleElem = titleAndDescParentContainer.querySelectorAll(":scope > h1")[0];
        const descriptionElem = titleAndDescParentContainer.querySelectorAll(":scope > span")[0];

        titleElem.addEventListener('keydown', (e) => {
            //TODO
            // if (e.key === 'Enter') {
            //     e.preventDefault(); // prevent new lines
            // }
        })

        titleElem.addEventListener('blur', () => {
            this.VIEW_MODEL.editWorkspaceTitle(this.id, titleElem.textContent, descriptionElem.textContent);
        });

        descriptionElem.addEventListener('keydown', (e) => {
            //TODO
            // if (e.key === 'Enter') {
            //     e.preventDefault(); // prevent new lines
            // }
        })

        descriptionElem.addEventListener('blur', () => {
            this.VIEW_MODEL.editWorkspaceTitle(this.id, titleElem.textContent, descriptionElem.textContent);
        });
    }

}