/**
 *  The names this interface is built out of: its custom elements, the classes that bind a
 *  control to an action, and the plain classes the stylesheets use.
 *
 *  **Their own module rather than the entry point's.** They used to live in `main.ts`, which
 *  is also the script that starts the new tab page - so importing one name pulled in the
 *  bootstrap with it, and anything that imported a partial ran the whole application. On the
 *  new tab page that is harmless, because it was going to run anyway; in a test it meant every
 *  suite that touched a component quietly booted the app against a document that has no
 *  workspace in it, which vitest reports as an unhandled error and warns can mask a failure.
 */

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
export const ACT_OPEN_ALL_SUBGROUP_LINKS = "action-open-all-subgroup-links"
export const ACT_SUBGROUP_MOVE_UP: string = "act-subgroup-move-up";
export const ACT_SUBGROUP_MOVE_DOWN: string = "act-subgroup-move-down";

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
export const CLASS_SIGNED_OUT_NOTICE: string = "cls-signed-out-notice";
/** Why the open workspace does not synchronise, in the workspace head. */
export const CLASS_WORKSPACE_SYNC_NOTICE: string = "cls-workspace-sync-notice";

// Group component
export const CLASS_GROUP_HEAD_TITLE: string = "cls-group-head-title";
export const CLASS_GROUP_HEAD_ACTIONS: string = "cls-group-head-actions";

// Subgroup component
export const CLASS_SUBGROUP_HEAD_TITLE = "cls-subgroup-head-title";
export const CLASS_SUBGROUP_HEAD_ACTIONS = "cls-subgroup-head-actions";
export const CLASS_SUBGROUP_HEAD_ACTIONS_COMMON = "cls-subgroup-head-actions-common";
export const CLASS_SUBGROUP_HEAD_ACTIONS_TOGGLED = "cls-subgroup-head-actions-toggled";
export const CLASS_SUBGROUP_LINK_COUNT = "cls-subgroup-link-count";

// Link component
export const CLASS_LINK_WRAPPER = "cls-link-wrapper";
export const CLASS_LINK_ACTIONS_CONTAINER = "cls-link-actions-container";
export const CLASS_LINK_TEXT = "cls-link-text";
export const CLASS_LINK_ICON= "cls-link-icon";
