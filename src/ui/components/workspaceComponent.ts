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
    CLASS_ACTION_ADD, CLASS_WORKSPACE_HEADER_LEFT, CLASS_WORKSPACE_HEADER_RIGHT, ACT_EDIT_GROUP, ACT_APP_MENU,
    ACT_USER_PROFILES, CLASS_ACTION_ACTIVE, CLASS_ACTION_HIGHLIGHT, ACT_CLOSED_TABS, ELEM_WORKSPACE_FOOTER,
} from "../../main"

// data/model layer
import { WorkspaceDTO, GroupDTO, ProfileDTO } from "../../viewModel/abstract/dtos";
import { GroupViewModel } from "../../viewModel/groupViewModel";
import { WorkspaceViewModel } from "../../viewModel/workspaceViewModel";
import { AccountDTO, SyncAccountViewModel } from "../../viewModel/syncAccountViewModel";

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
import {ClosedTabsPanel} from "../partials/closedTabsPanel";

export class WorkspaceComponent extends AbstractComponent<WorkspaceDTO, WorkspaceViewModel> {

    private currentWorkspaceId: string = "";

    /** The recently closed tabs drawer, built the first time it is opened. */
    private closedTabsPanel: ClosedTabsPanel | null = null;

    /** Account section of the application menu; not tied to AppState, hence its own view model. */
    private accountViewModel: SyncAccountViewModel = new SyncAccountViewModel();

    // "Device name" is optional and last, so the required fields stay where the eye starts.
    // Leaving it blank keeps the automatic label; it earns its place only for somebody running
    // several browsers on one machine, where the automatic labels are all identical.
    private logInDialog: InputDialog = new InputDialog(
        "Log in",
        {
            "Username or email": { type: "string", required: true },
            "Password": { type: "password", required: true },
            "Device name": { type: "string", maxLength: MAX_NAME_LENGTH }
        },
        ({ usernameOrEmail, password, deviceName }) =>
            this.accountViewModel.logIn(usernameOrEmail, password, deviceName));

    // the field is labelled the way the website labels it ("Your connect code"), so the user
    // recognises what to paste, while the menu entry keeps the wording of the sync feature
    private syncCodeDialog: InputDialog = new InputDialog(
        "Enter sync code",
        {
            "Connect code": { type: "string", required: true },
            "Device name": { type: "string", maxLength: MAX_NAME_LENGTH }
        },
        ({ connectCode, deviceName }) =>
            this.accountViewModel.connectWithCode(connectCode, deviceName));

    private addWorkspaceDialog: InputDialog = new InputDialog(
        "Add workspace",
        {
            "Workspace name": { type: "string", required: true, maxLength: MAX_NAME_LENGTH },
            "Workspace description": { type: "string", maxLength: MAX_DESCRIPTION_LENGTH }
        },
        ({ workspaceName, workspaceTitle }) =>
          this.VIEW_MODEL.addWorkspace(workspaceName, workspaceTitle));

    private createProfileDialog: InputDialog = new InputDialog(
        "Create profile",
        { "Profile name": { type: "string", required: true, maxLength: MAX_NAME_LENGTH } },
        ({ profileName }) => this.VIEW_MODEL.createProfile(profileName));

    private addGroupDialog: InputDialog = new InputDialog(
        "Add group",
        {
            "Group name": { type: "string", required: true, maxLength: MAX_NAME_LENGTH },
            "Group description": { type: "string", maxLength: MAX_DESCRIPTION_LENGTH }
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
        headerElemLeftContent.appendChild(renderTextContainer("span", "Workspaces"));
        headerElemLeftContent.appendChild(renderContainer([]));
        this.VIEW_MODEL.observables.workspaces
            .subscribe((workspaces: WorkspaceDTO[]) => this.renderWorkspaceSwitcher(headerElemLeftContent, workspaces));

        // add workspace button
        headerElemLeftContent.appendChild(renderButton(
            ICON.ADD,
            "",
            [ACT_ADD_WORKSPACE, CLASS_ACTION_ADD],
            "Add new workspace",
            onClick => {
                this.LOG.debug("renderWorkspaceSwitcherToolings", "add workspace clicked");
                this.addWorkspaceDialog.show();
            }
        ));

        // recently closed tabs, first on the right so it sits furthest from the menus: it is
        // reached far more often than they are, and it opens a panel rather than a menu.
        headerElemRightContent.appendChild(renderButton(
            ICON.IMPORT,
            "",
            [ACT_CLOSED_TABS],
            "Recently closed tabs",
            () => void this.toggleClosedTabs()
        ));

        // application / profiles menu — populated reactively via observables.profiles
        // headerElemRightContent.appendChild(renderTextContainer("span", "Profile"));

        const profilesMenu = new OptionsMenu(
            headerElemRightContent,
            {
                openMenuButtonId: `user-profiles`,
                openMenuButtonClass: [ACT_USER_PROFILES, CLASS_ACTION_HIGHLIGHT],
                openMenuButtonTooltipText: "User profiles list",
                openMenuButtonContent: `...`
            },
            [],
            {}
        );

        this.VIEW_MODEL.observables.profiles
            .subscribe((profiles: ProfileDTO[]) => {
                const active = profiles.find(p => p.active);
                profilesMenu.updateButtonContent(`Profile: ${active?.name ?? '...'}`);
                profilesMenu.updateOptions([
                    ...profiles.map(p => ({
                        actionTitle: p.name,
                        active: p.active,
                        onClick: () => this.VIEW_MODEL.switchProfile(p.id)
                    })),
                    {
                        separator: true
                    },
                    {
                        actionTitle: `${ICON.EXPORT} Export current profile`,
                        noBorder: true,
                        onClick: () => this.VIEW_MODEL.exportCurrentProfile()
                    },
                    {
                        actionTitle: `${ICON.IMPORT} Import profile`,
                        noBorder: true,
                        onClick: () => this.VIEW_MODEL.importProfile()
                    },
                    {
                        actionTitle: `${ICON.ADD} Create new profile`,
                        noBorder: true,
                        onClick: () => this.createProfileDialog.show()
                    },
                    {
                        actionTitle: `${ICON.EDIT} Manage profiles`,
                        onClick: () => void new ProfileManagerDialog().show()
                    }
                ]);
            });

        // application / user account menu - rebuilt reactively from the sync session
        const accountMenu = new OptionsMenu(
            headerElemRightContent,
            {
                openMenuButtonId: `application-menu`,
                openMenuButtonClass: ACT_APP_MENU,
                openMenuButtonTooltipText: "Application menu"
            },
            [],
            {}
        );

        this.accountViewModel.initialize();
        this.accountViewModel.observables.account
            .subscribe((account: AccountDTO) => accountMenu.updateOptions(
                account.signedIn
                    ? this.buildSignedInAccountMenuItems(account)
                    : this.buildSignedOutAccountMenuItems()));
    }

    /**
     *  Application menu while no account is connected: the three ways of getting one.
     */
    private buildSignedOutAccountMenuItems(): OptionsMenuItem[] {
        return [
            {
                actionTitle: "Log in",
                onClick: () => this.logInDialog.show()
            },
            {
                actionTitle: "Register",
                onClick: () => this.accountViewModel.openRegistrationPage()
            },
            {
                actionTitle: "Enter sync code",
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
            {
                actionTitle: "Log out",
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
                actionTitle: "Settings",
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
                openMenuButtonTooltipText: "Edit current workspace",
                openMenuButtonClass: ACT_EDIT_WORKSPACE
            },
            [
                {
                    actionTitle: "Add workspace",
                    onClick: () => this.actionAddGroup(workspace.id)
                },
                {
                    actionTitle: "Edit Workspace title",
                    onClick: () => this.toggleWorkspaceTitleEditable(event?.target as HTMLElement)
                },
                {
                    actionTitle: "Delete workspace",
                    dangerous: true,
                    dangerConfirmation: "All groups and links that are associated to that workspace will be deleted as well.",
                    onClick: () => this.VIEW_MODEL.deleteWorkspace(this.id)
                }
            ],
            {
                workspaceId: this.id
            }
        );

        // add group
        actionsSectionElem.appendChild(renderButton(
            ICON.ADD + " Add group",
            workspace.id,
            [ACT_ADD_GROUP, CLASS_ACTION_ADD],
            "Add new group",
            (event) => this.actionAddGroup(workspace.id)
        ));

        // settings menu
        parentElem.replaceChildren(
            titleSectionElem,
            actionsSectionElem
        );

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

    /**
     *  Opens the recently closed tabs, building the panel the first time it is asked for.
     *
     *  Built on demand rather than with the page: it opens a second store and subscribes to
     *  the state, and most new tabs are opened to click one link and be gone again.
     */
    private async toggleClosedTabs(): Promise<void> {
        if (!this.closedTabsPanel) {
            this.closedTabsPanel = new ClosedTabsPanel();
            await this.closedTabsPanel.render(document.body);
        }
        this.closedTabsPanel.toggle();
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
            setTimeout(() => { menuItem.textContent = "Save Workspace title" }, 250);
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