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
    ACT_USER_PROFILES, CLASS_ACTION_ACTIVE, CLASS_ACTION_HIGHLIGHT,
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
import {ProfileManagerDialog} from "../partials/profileManagerDialog";

export class WorkspaceComponent extends AbstractComponent<WorkspaceDTO, WorkspaceViewModel> {

    private currentWorkspaceId: string = "";

    /** Account section of the application menu; not tied to AppState, hence its own view model. */
    private accountViewModel: SyncAccountViewModel = new SyncAccountViewModel();

    // "Device name" is optional and last, so the required fields stay where the eye starts.
    // Leaving it blank keeps the automatic label; it earns its place only for somebody running
    // several browsers on one machine, where the automatic labels are all identical.
    private logInDialog: InputDialog = new InputDialog(
        "Log in",
        { "Username or email": "string", "Password": "password", "Device name": "string" },
        ({ usernameOrEmail, password, deviceName }) =>
            this.accountViewModel.logIn(usernameOrEmail, password, deviceName));

    // the field is labelled the way the website labels it ("Your connect code"), so the user
    // recognises what to paste, while the menu entry keeps the wording of the sync feature
    private syncCodeDialog: InputDialog = new InputDialog(
        "Enter sync code",
        { "Connect code": "string", "Device name": "string" },
        ({ connectCode, deviceName }) =>
            this.accountViewModel.connectWithCode(connectCode, deviceName));

    private addWorkspaceDialog: InputDialog = new InputDialog(
        "Add workspace",
        { "Workspace name": "string" },
        ({ workspaceName }) => this.VIEW_MODEL.addWorkspace(workspaceName));

    private createProfileDialog: InputDialog = new InputDialog(
        "Create profile",
        { "Profile name": "string" },
        ({ profileName }) => this.VIEW_MODEL.createProfile(profileName));

    private addGroupDialog: InputDialog = new InputDialog(
        "Add group",
        { "Group name": "string" },
        ({ groupName }) => this.VIEW_MODEL.addGroup(this.currentWorkspaceId, groupName));

    render(parentElem: HTMLElement) {

        const headElem: HTMLElement = document.createElement(ELEM_WORKSPACE_HEAD);
        const bodyElem: HTMLElement = document.createElement(ELEM_WORKSPACE_BODY);
        this.appendChild(headElem);
        this.appendChild(bodyElem);

        // page header
        this.renderHeader();

        // page body - workspace titlebar
        this.VIEW_MODEL.observables.workspace
            .subscribe((workspace: WorkspaceDTO) => {
                this.id = workspace.id; // exception, because this is root template
                this.renderWorkspaceHead(headElem, workspace);
                bodyElem.replaceChildren();
                this.renderGroups(bodyElem, this.VIEW_MODEL.getGroups(workspace.id));
            });

        // page body - groups
        this.VIEW_MODEL.observables.groups
            .subscribe(groups => this.renderGroups(bodyElem, groups));

        // page footer
        this.renderFooter();
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
            }
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
     *  Application footer content
     */
    private renderFooter() {
        const footerElem: HTMLElement = document.body.getElementsByTagName("footer")[0];

        const dummyTextElem = document.createElement("span");
        dummyTextElem.title = "tiririri";
        footerElem.appendChild(dummyTextElem);
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