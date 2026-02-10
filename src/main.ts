import { appStateDAO } from "./backend/repository/AppStateRepository";
import { appStateInit } from "./backend/datasource/init/AppStateInit";

import {WorkspaceComponent} from "./ui/components/workspaceComponent";
import {GroupComponent} from "./ui/components/groupComponent";
import {LinkComponent} from "./ui/components/linkComponent";
import {SubgroupComponent} from "./ui/components/subgroupComponent";

/**
 *  CSS files
 */

import './ui/styles/reset.css'
import './ui/styles/main.css'
import './ui/styles/workspace.css'
import './ui/styles/group.css'
import './ui/styles/subgroup.css'
import './ui/styles/link.css'

/**
 *  Custom HTML elements names
 */

export const ELEM_WORKSPACE = "workspace-plane";
export const ELEM_WORKSPACE_HEAD = "workspace-plane-head";
export const ELEM_WORKSPACE_BODY = "workspace-plane-body";

export const ELEM_GROUP: string = "link-group";
export const ELEM_GROUP_HEAD: string = "link-group-head";
export const ELEM_GROUP_BODY: string = "link-group-body";
export const ELEM_GROUP_FOOT: string = "link-group-foot";

export const ELEM_SUBGROUP: string = "link-subgroup"

export const ELEM_LINK: string = "link-container";

/**
 *  Class names bound to some actions triggered by UI elements by user
 */

export const ACT_SWITCH_WORKSPACE: string = "action-switch-workspace";
export const ACT_ADD_WORKSPACE: string = "action-add-workspace";
export const ACT_EDIT_WORKSPACE: string = "action-edit-workspace";

export const ACT_ADD_GROUP: string = "action-add-group";
export const ACT_EDIT_GROUP: string = "action-edit-group";

export const ACT_ADD_LINK: string = "action-add-link";

// define custom elements used BEFORE they are created/constructed
// otherwise You are unable to call custom methods for example for
// injecting repository later on them
customElements.define(ELEM_WORKSPACE, WorkspaceComponent);
customElements.define(ELEM_GROUP, GroupComponent);
customElements.define(ELEM_SUBGROUP, SubgroupComponent);
customElements.define(ELEM_LINK, LinkComponent);

(async () => {

    // initialize "app data" object and repository, WAIT FOR IT !!!
    await appStateDAO.init(appStateInit);

    // create custom HTML element ONLY THAT WAY otherwise (innerHTML() method or
    // raw in html file) construction of object happens before initialized "repository"
    // is injected and program crashes
    const workspaceElement = document.createElement(ELEM_WORKSPACE) as WorkspaceComponent;
    workspaceElement.setRepository(appStateDAO);
    document.body
        .getElementsByTagName("main")[0]
        .appendChild(workspaceElement);

})();
