import {qsAll, handleReactiveRendering, toggleActiveClassOnSpecificAttribute} from "../../utils/firstOrderMethods";
import {ELEM_GROUP, ELEM_WORKSPACE, ELEM_WORKSPACE_BODY, ELEM_WORKSPACE_HEAD, ACT_SWITCH_WORKSPACE, ACT_ADD_GROUP, ACT_EDIT_WORKSPACE, ACT_ADD_WORKSPACE} from "../../main"
import {renderButton, renderContainer, ICON, renderTextContainer} from "../../utils/elementsRendering"

// data/model layer
import { AppStateRepository } from "../../backend/repository/AppStateRepository";
import { WorkpsaceDTO, GroupDTO } from "../../viewModel/abstract/dtos";
import { GroupViewModel } from "../../viewModel/groupViewModel";

// components layer
import { AbstractComponent } from "../abstract/abstractComponent";
import { GroupComponent } from "./groupComponent";
import { OptionsMenu } from "../partials/optionsMenu"

export class WorkspaceComponent extends AbstractComponent<WorkpsaceDTO, WorkspaceViewModel> {

    private render(parentElem: HTMLElement) {

        const headerElem: HTMLElement = document.body.getElementsByTagName("header")[0];
        const footerElem: HTMLElement = document.body.getElementsByTagName("footer")[0];
        const headElem: HTMLElement = document.createElement(ELEM_WORKSPACE_HEAD);
        const bodyElem: HTMLElement = document.createElement(ELEM_WORKSPACE_BODY);
        this.appendChild(headElem);
        this.appendChild(bodyElem);

        this.VIEW_MODEL.observables.workspaces
            .subscribe((workspaces: WorkspaceDTO[]) => this.renderWorkspaceSwitcher(headerElem, workspaces));

        this.renderWorkspaceSwitcherToolings(headerElem);

        this.VIEW_MODEL.observables.workspace
            .subscribe((workspace: WorkspaceDTO) => {
                this.renderWorkspaceHead(headElem, workspace);
                bodyElem.replaceChildren();
                this.renderGroups(bodyElem, this.VIEW_MODEL.getGroups(workspace.id));
            });

        this.VIEW_MODEL.observables.groups
            .subscribe((groupIds: string[]) => this.renderGroups(bodyElem, groupIds));

        this.renderFooter(footerElem);
    }

    private attachListeners(parentElem: HTMLElement) {

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
    private renderWorkspaceSwitcher(parentElem: HTMLElement, workspaces: WorkspaceDTO[]) {

        // workspaces switcher
        handleReactiveRendering<WorkspaceDTO, HTMLButtonElement>(
            parentElem.getElementsByTagName("div")[0],
            workspaces,
            workspace => workspace.id,
            workspace => renderButton(
                workspace.title,
                workspace.id,
                [ACT_SWITCH_WORKSPACE],
                null,
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
        const activeWorkspaceId: string = workspaces.find((workspace: WorkspaceDTO) => workspace.active).id;
        toggleActiveClassOnSpecificAttribute<HTMLButtonElement>("value", activeWorkspaceId, ACT_SWITCH_WORKSPACE);
    }

    /**
     * Top menu workspace switcher content (Application header content)
     *
     * Parent to inflate:
     *
     *  <header>
     *      ...
     *      [[ add workspace button ]]
     *  </header>
     */
    private renderWorkspaceSwitcherToolings(parentElem: HTMLElement) {

        // add workspace button
        parentElem.appendChild(renderButton(
            ICON.ADD,
            null,
            [ACT_ADD_WORKSPACE],
            "Add new workspace",
            clicked => {
                this.LOG.debug("renderWorkspaceSwitcherToolings", "add workspace clicked");
                this.VIEW_MODEL.addWorkspace(prompt("Give a name for workspace"));
            }
        ));
    }

    /**
     *  Workspace heading
     */
    private renderWorkspaceHead(parentElem: HTMLElement, workspace: WorkspaceDTO) {

        const titleSectionElem: HTMLElement = renderContainer(["workspace-head-title"]);
        const actionsSectionElem: HTMLElement = renderContainer(["workspace-head-actions"]);

        // title
        titleSectionElem.appendChild(renderTextContainer(
            workspace.title, "h1"));
        titleSectionElem.appendChild(renderTextContainer(
            "TODO prirobit do tatoveho modelu workspace description", "span"));

        // edit workspace screen
        new OptionsMenu(
            actionsSectionElem,
            {
                openMenuButtonId: `workpsace-${this.id}-menu`
            },
            [
                {
                    actionTitle: "Edit Workspace title",
                    dangerous: false,
                    onClick: (metadata) => {
                        this.LOG.debug("edit workspace title clicked");
                        this.LOG.debug("Workspace id: " + metadata.workspaceId);
                    }
                },
                {
                    actionTitle: "Delete workspace",
                    dangerous: true,
                    onClick: (metadata) => {
                        this.LOG.debug("delete workspace title clicked");
                        this.LOG.debug("Workspace id: " + metadata.workspaceId);
                    }
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
            [ACT_ADD_GROUP],
            "Add new group",
            (event) => {
                this.LOG.debug("add group clicked");
                this.VIEW_MODEL.addGroup(workspace.id, prompt("Group name?"))
            }
        ));

        parentElem.replaceChildren(
            titleSectionElem,
            actionsSectionElem
        );
    }

    /**
     *  Workspace's groups with links and subgroups containers
     */
    private renderGroups(parentElem: HTMLElement, groups: GroupDTO[]) {

        handleReactiveRendering<GroupDTO>(
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
    private renderFooter(parentElem: HTMLElement) {
        const dummyTextElem = document.createElement("span");
        dummyTextElem.title = "tiririri";
        parentElem.appendChild(dummyTextElem);
    }

}