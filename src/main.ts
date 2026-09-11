import { appStateRepository } from "./backend/repository/AppStateRepository";
import { profileRepository } from "./backend/repository/ProfileRepository";
import { installationIdentity } from "./backend/sync/InstallationIdentity";
import { sessionRepository } from "./backend/sync/SessionRepository";
import { syncCoordinator } from "./backend/sync/SyncCoordinator";
import { appStateInit } from "./backend/datasource/init/AppStateInit";
import { Environment } from "./backend/entity/AppStateEntity";
import { WorkspaceDTO } from "./viewModel/abstract/dtos"

import { WorkspaceViewModel } from "./viewModel/workspaceViewModel"

import {FirstRunComponent} from "./ui/components/firstRunComponent";
import {WorkspaceComponent} from "./ui/components/workspaceComponent";
import {GroupComponent} from "./ui/components/groupComponent";
import {LinkComponent} from "./ui/components/linkComponent";
import {SubgroupComponent} from "./ui/components/subgroupComponent";

/**
 *  CSS files
 */

import './ui/styles/__variables.css'

import './ui/styles/reset.css'
import './ui/styles/main.css'
import './ui/styles/firstRun.css'
import './ui/styles/workspace.css'
import './ui/styles/group.css'
import './ui/styles/subgroup.css'
import './ui/styles/link.css'

import './ui/styles/_optionsMenu.css'
import './ui/styles/_inputDialog.css'
import './ui/styles/_profileManager.css'
import './ui/styles/_settingsDialog.css'
import './ui/styles/_tipsBar.css'
import './ui/styles/_closedTabs.css'

/**
 *  Custom HTML elements names
 */

export const ELEM_FIRSTRUN: string = 'first-run';

export const ELEM_WORKSPACE = "workspace-plane";
export const ELEM_WORKSPACE_HEAD = "workspace-plane-head";
export const ELEM_WORKSPACE_BODY = "workspace-plane-body";
export const ELEM_WORKSPACE_FOOTER = "workspace-plane-footer";

export const ELEM_GROUP: string = "link-group";
export const ELEM_GROUP_HEAD: string = "link-group-head";
export const ELEM_GROUP_HEAD_TITLE: string = "link-group-head-title";
export const ELEM_GROUP_HEAD_ACTIONS: string = "link-group-head-actions";
export const ELEM_GROUP_BODY: string = "link-group-body";
export const ELEM_GROUP_FOOT: string = "link-group-foot";

export const ELEM_SUBGROUP: string = "link-subgroup"
export const ELEM_SUBGROUP_HEAD: string = "link-subgroup-head";
export const ELEM_SUBGROUP_BODY = "link-subgroup-body"

export const ELEM_LINK: string = "link-container";

export const ELEM_OPTIONS_MENU = "options-menu";
export const ELEM_OPTIONS_MENU_ITEM = "options-menu-item";

/**
 *  Class names bound to some actions triggered by UI elements by user
 */

// "Greetings" screen
export const ACT_FIRST_WORKSPACE: string = "act-first-workspace";
export const ACT_IMPORT_LINKS: string = "act-import-links";
export const ACT_LOAD_DEFAUTLS: string = "act-load-defaults";
export const ACT_FIRST_RUN_CONNECT_CODE: string = "act-first-run-connect-code";
export const ACT_FIRST_RUN_LOG_IN: string = "act-first-run-log-in";

// Workspace component
export const ACT_APP_MENU: string = "action-app-menu";
export const ACT_USER_PROFILES: string = "action-user-profiles-menu";
export const ACT_CLOSED_TABS: string = "action-closed-tabs";
export const ACT_SWITCH_WORKSPACE: string = "action-switch-workspace";
export const ACT_ADD_WORKSPACE: string = "action-add-workspace";
export const ACT_EDIT_WORKSPACE: string = "action-edit-workspace";

// Group component
export const ACT_ADD_GROUP: string = "action-add-group";
export const ACT_EDIT_GROUP: string = "action-edit-group";
export const ACT_ADD_LINK: string = "action-add-link";

// Sub-group component
export const ACT_EDIT_SUBGROUP: string = "action-edit-subgroup";
export const ACT_OPEN_ALL_SUBGROUP_LINKS = "action-open-all-subgroup-links"
export const ACT_SUBGROUP_MOVE_UP: string = "act-subgroup-move-up";
export const ACT_SUBGROUP_MOVE_DOWN: string = "act-subgroup-move-down";
export const CLASS_SUBGROUP_MOVE_ACTIONS: string = "cls-subgroup-move-actions";

// Link component
export const ACT_LINK_MOVE_UP: string = "act-link-move-up";
export const ACT_LINK_MOVE_DOWN: string = "act-link-move-down";
export const ACT_LINK_DELETE: string = "act-link-delete";
export const ACT_LINK_EDIT: string = "act-link-edit";

/**
 *  Plain class names
 */

// General classes
export const CLASS_ACTION_ADD: string = "add";
export const CLASS_ACTION_DANGER: string = "danger";
export const CLASS_ACTION_ACTIVE: string = "active";
export const CLASS_ACTION_HIGHLIGHT: string = "highlight";

// Workspace component
export const CLASS_WORKSPACE_HEADER_LEFT: string = "cls-workspace-header-left";
export const CLASS_WORKSPACE_HEADER_RIGHT: string = "cls-workspace-header-right";
export const CLASS_WORKSPACE_HEAD_TITLE: string = "cls-workspace-head-title";
export const CLASS_WORKSPACE_HEAD_ACTIONS: string = "cls-workspace-head-actions";

// Group component
export const CLASS_GROUP_HEAD_TITLE: string = "cls-group-head-title";
export const CLASS_GROUP_HEAD_ACTIONS: string = "cls-group-head-actions";

// Subgroup component
export const CLASS_SUBGROUP_HEAD_TITLE = "cls-subgroup-head-title";
export const CLASS_SUBGROUP_HEAD_ACTIONS = "cls-subgroup-head-actions";
export const CLASS_SUBGROUP_LINK_COUNT = "cls-subgroup-link-count";

// Link component
export const CLASS_LINK_ACTIONS_CONTAINER = "cls-link-actions-container";
export const CLASS_LINK_TEXT = "cls-link-text";
export const CLASS_LINK_ICON= "cls-link-icon";

// define custom elements used BEFORE they are created/constructed
// otherwise You are unable to call custom methods for example for
// injecting repository later on them
customElements.define(ELEM_WORKSPACE, WorkspaceComponent);
customElements.define(ELEM_GROUP, GroupComponent);
customElements.define(ELEM_SUBGROUP, SubgroupComponent);
customElements.define(ELEM_LINK, LinkComponent);
customElements.define(ELEM_FIRSTRUN, FirstRunComponent);

(async () => {

    // identity of this installation and the signed-in account, if any - both are read
    // before anything renders so the application menu draws its final state at once
    await installationIdentity.init();
    await sessionRepository.init();

    // initialize profile registry first so we know which profile to load
    await profileRepository.init();
    // initialize "app data" object and repository, WAIT FOR IT !!!
    await appStateRepository.init(appStateInit, profileRepository.getActiveProfileId());

    // Synchronisation watches the repositories above, so it starts after them. It is not
    // awaited to completion: a signed-in device pushes and pulls in the background while the
    // page renders what it already has, and the page redraws itself when the account answers.
    await syncCoordinator.start();

    // create custom HTML element ONLY THAT WAY otherwise (innerHTML() method or
    // raw in html file) construction of object happens before initialized "repository"
    // is injected and program crashes
    const currentEnvironment: Environment | null = appStateRepository.getCurrentEnvironment();
    const rootContainerElem = document.body.getElementsByTagName("main")[0];

    if (!currentEnvironment) {

        const guideElem = document.createElement(ELEM_FIRSTRUN) as FirstRunComponent;
        guideElem.initialize(appStateRepository);
        rootContainerElem.appendChild(guideElem);

        // This screen is chosen once, from the state as it stands right now, but an account
        // that already has links may still be arriving over the network. When it lands there
        // is a workspace to show and this screen is the wrong one, so start again.
        //
        // Only when it *lands*, though. subscribe() replays the current value to a new
        // subscriber, and the current value is the very state that chose this screen; acting
        // on that replay would reload into the same decision and reload again, several times
        // a second, for as long as the tab was open. So the replay is skipped and the reload
        // is fired at most once.
        let replayed = false;
        let reloading = false;
        appStateRepository.state$.subscribe(state => {
            if (!replayed) {
                replayed = true;
                return;
            }
            if (!reloading && Object.keys(state.environments).length > 0) {
                reloading = true;
                window.location.reload();
            }
        });

    } else {

        const workspaceDTO: WorkspaceDTO = ({
            id: currentEnvironment.id,
            title: currentEnvironment.name,
            description: currentEnvironment.description
        }) satisfies WorkspaceDTO;

        const workspaceElement = document.createElement(ELEM_WORKSPACE) as WorkspaceComponent;
        workspaceElement.initialize(appStateRepository, workspaceDTO, WorkspaceViewModel);
        rootContainerElem.appendChild(workspaceElement);
    }

})();
