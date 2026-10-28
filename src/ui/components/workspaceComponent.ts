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
    ACT_USER_PROFILES, ACT_THEME_MENU, CLASS_ACTION_HIGHLIGHT, ELEM_WORKSPACE_FOOTER,
} from "../../constants"

// data/model layer
import { WorkspaceDTO, GroupDTO, ProfileDTO } from "../../viewModel/abstract/dtos";
import { GroupViewModel } from "../../viewModel/groupViewModel";
import { WorkspaceViewModel } from "../../viewModel/workspaceViewModel";
import { AccountDTO, logInRequests$, SyncAccountViewModel } from "../../viewModel/syncAccountViewModel";
import { syncStateViewModel } from "../../viewModel/syncStateViewModel";
import { ThemeMenuDTO, ThemeMenuViewModel } from "../../viewModel/themeMenuViewModel";
import { ThemeId } from "../../backend/repository/DevicePreferencesRepository";

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
import { signInDeviceFields, wantsSync } from "../partials/signInFields";
import {ProfileManagerDialog} from "../partials/profileManagerDialog";
import {SettingsDialog} from "../partials/settingsDialog";
import {TipsBar} from "../partials/tipsBar";
import {AdsBar} from "../partials/adsBar";
import {ClosedTabsPanel} from "../partials/closedTabsPanel";
import {SearchBar} from "../partials/searchBar";
import { t } from "../../i18n/i18n";

/** The theme switcher's button: which theme is in force, at a glance. */
const THEME_ICONS: Record<ThemeId, string> = {
    auto: ICON.THEME_AUTO,
    light: ICON.THEME_LIGHT,
    dark: ICON.THEME_DARK
};

export class WorkspaceComponent extends AbstractComponent<WorkspaceDTO, WorkspaceViewModel> {

    private currentWorkspaceId: string = "";

    /**
     *  The workspace's name and description while they are being edited in place: the menu item
     *  that started it, and the text from before, for Escape to put back. Null otherwise.
     */
    private renaming: { menuItem: HTMLElement; title: string; description: string } | null = null;

    /** The recently closed tabs rail. */
    private closedTabsPanel: ClosedTabsPanel | null = null;

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

    /** The header's theme switcher; device preferences, so not tied to AppState either. */
    private themeMenuViewModel: ThemeMenuViewModel = new ThemeMenuViewModel();

    // The last two fields - synchronise, device name - are `signInDeviceFields`, shared by
    // every sign-in dialog.
    private logInDialog: InputDialog = new InputDialog(
        t("sync.logInDialog.title"),
        {
            [t("sync.logInDialog.usernameOrEmail")]:
                { type: "string", required: true, key: "usernameOrEmail" },
            [t("sync.logInDialog.password")]:
                { type: "password", required: true, key: "password" },
            ...signInDeviceFields()
        },
        () => void this.accountViewModel.finishSignIn(),
        ({ usernameOrEmail, password, deviceName, synchronise }) =>
            this.accountViewModel.logIn(
                usernameOrEmail, password, deviceName, wantsSync(synchronise)));

    // the field is labelled the way the website labels it ("Your connect code"), so the user
    // recognises what to paste, while the menu entry keeps the wording of the sync feature
    private syncCodeDialog: InputDialog = new InputDialog(
        t("sync.syncCodeDialog.title"),
        {
            [t("sync.syncCodeDialog.connectCode")]:
                { type: "string", required: true, key: "connectCode" },
            ...signInDeviceFields()
        },
        () => void this.accountViewModel.finishSignIn(),
        ({ connectCode, deviceName, synchronise }) =>
            this.accountViewModel.connectWithCode(
                connectCode, deviceName, wantsSync(synchronise)));

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

        this.renderThemeMenu(headerElemRightContent);

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

    /**
     *  The theme switcher, before the profiles menu (#155): its button shows the theme in force
     *  as an icon, and each theme is a checkable item - the look of the account menu's
     *  "Synchronized" - so the menu says which one is set before anything is picked.
     */
    private renderThemeMenu(parentElem: HTMLElement): void {
        const themeMenu = new OptionsMenu(
            parentElem,
            {
                openMenuButtonId: `theme-menu`,
                openMenuButtonClass: ACT_THEME_MENU,
                openMenuButtonContent: THEME_ICONS[this.themeMenuViewModel.menu$.get().chosen]
            },
            [],
            {}
        );
        this.themeMenuViewModel.menu$.subscribe((menu: ThemeMenuDTO) => {
            const chosen = menu.options.find(option => option.chosen);
            themeMenu.updateButtonContent(THEME_ICONS[menu.chosen]);
            themeMenu.setTooltip(t("header.themeMenu", { theme: chosen?.label ?? "" }));
            themeMenu.updateOptions(menu.options.map(option => ({
                actionTitle: option.label,
                noBorder: true,
                checkable: true,
                active: option.chosen,
                onClick: () => void this.themeMenuViewModel.choose(option.theme)
            })));
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
            // The status is also the switch: ticked, this browser synchronises and the text says
            // how that is going; unticked, it says it is off. Greyed out while a synchronisation
            // runs, so it cannot be switched off halfway through one.
            {
                actionTitle: account.syncStatus ?? "",
                noBorder: true,
                checkable: true,
                active: account.syncEnabled,
                disabled: account.syncing,
                onClick: () => void this.accountViewModel.setSyncEnabled(!account.syncEnabled)
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
        // A redraw replaces the name, the description and the menu: an edit in progress ends.
        this.renaming = null;

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
        await this.closedTabsPanel.render(document.body);
    }

    /** "Edit title" starts editing the name in place; the same item, now "Save title", ends it. */
    private toggleWorkspaceTitleEditable(menuItem: HTMLElement) {
        if (this.renaming) {
            this.finishRenamingWorkspace(true);
        } else {
            this.startRenamingWorkspace(menuItem);
        }
    }

    /** The name and description elements of the heading as it is drawn now. */
    private workspaceTitleElements(): { titleElem: HTMLElement; descriptionElem: HTMLElement } {
        const container = this.getElementsByClassName(CLASS_WORKSPACE_HEAD_TITLE)[0];
        return {
            titleElem: container.querySelector(":scope > h1") as HTMLElement,
            descriptionElem: container.querySelector(":scope > span") as HTMLElement
        };
    }

    private startRenamingWorkspace(menuItem: HTMLElement): void {
        const { titleElem, descriptionElem } = this.workspaceTitleElements();
        this.renaming = {
            menuItem,
            title: titleElem.textContent ?? "",
            description: descriptionElem.textContent ?? ""
        };
        for (const elem of [titleElem, descriptionElem]) {
            elem.setAttribute("contenteditable", "true");
            elem.classList.add("editable");
        }
        menuItem.classList.add("active");
        setTimeout(() => { menuItem.textContent = t("workspace.menu.saveTitle") }, 250);

        // Straight into the name, all of it selected, as a rename dialog would start.
        titleElem.focus();
        const selection = window.getSelection();
        if (selection) {
            const range = document.createRange();
            range.selectNodeContents(titleElem);
            selection.removeAllRanges();
            selection.addRange(range);
        }
    }

    /**
     *  Ends editing the name in place.
     *
     *  @param save true stores what was typed; false - Escape - puts back the text from before
     */
    private finishRenamingWorkspace(save: boolean): void {
        if (!this.renaming) {
            return;
        }
        const { menuItem, title, description } = this.renaming;
        this.renaming = null;
        const { titleElem, descriptionElem } = this.workspaceTitleElements();

        for (const elem of [titleElem, descriptionElem]) {
            elem.removeAttribute("contenteditable");
            elem.classList.remove("editable");
        }
        menuItem.classList.remove("active");
        setTimeout(() => { menuItem.textContent = menuItem.getAttribute('defaultText') }, 250);

        if (save) {
            this.VIEW_MODEL.editWorkspaceTitle(this.id, titleElem.textContent ?? "", descriptionElem.textContent ?? "");
        } else {
            titleElem.textContent = title;
            descriptionElem.textContent = description;
        }
    }

    private actionAddGroup(workspaceId: string): void {
        this.LOG.debug("add group clicked");
        this.currentWorkspaceId = workspaceId;
        this.addGroupDialog.show();
    }

    /**
     *  How editing the name in place ends (#117): focus leaving the name and description - a click
     *  anywhere outside them - or Enter saves; Escape puts the old text back. Moving between the
     *  name and the description is still editing. Attached again on every redraw, since the
     *  heading is built anew; an edit is only ever finished once (`finishRenamingWorkspace`).
     */
    private listenerChangeWorkspaceName() {
        const { titleElem, descriptionElem } = this.workspaceTitleElements();

        for (const elem of [titleElem, descriptionElem]) {
            elem.addEventListener('keydown', (event: KeyboardEvent) => {
                if (!this.renaming) {
                    return;
                }
                if (event.key === 'Enter') {
                    event.preventDefault();     // a name is one line
                    this.finishRenamingWorkspace(true);
                } else if (event.key === 'Escape') {
                    event.preventDefault();
                    this.finishRenamingWorkspace(false);
                }
            });
            elem.addEventListener('focusout', (event: FocusEvent) => {
                const goingTo = event.relatedTarget;
                if (goingTo === titleElem || goingTo === descriptionElem) {
                    return;
                }
                this.finishRenamingWorkspace(true);
            });
        }
    }

}