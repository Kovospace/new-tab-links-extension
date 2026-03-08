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
    CLASS_ACTION_ADD,
} from "../../main"

// data/model layer
import { WorkspaceDTO, GroupDTO } from "../../viewModel/abstract/dtos";
import { GroupViewModel } from "../../viewModel/groupViewModel";
import { WorkspaceViewModel } from "../../viewModel/workspaceViewModel";

// components layer
import { AbstractComponent } from "../abstract/abstractComponent";
import { GroupComponent } from "./groupComponent";
import { OptionsMenu } from "../partials/optionsMenu"

// utils
import { ICON, renderContainer, renderButton, renderTextContainer } from "../partials/wrappedHtmlElements"
import { handleReactiveRendering } from "../utils/rendering"
import { toggleActiveClassOnSpecificAttribute } from "../utils/elementsAttributesManipulation";

export class WorkspaceComponent extends AbstractComponent<WorkspaceDTO, WorkspaceViewModel> {

    render(parentElem: HTMLElement) {

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
                this.id = workspace.id; // exception, because this is root template
                this.renderWorkspaceHead(headElem, workspace);
                bodyElem.replaceChildren();
                this.renderGroups(bodyElem, this.VIEW_MODEL.getGroups(workspace.id));
            });

        this.VIEW_MODEL.observables.groups
            .subscribe(groups => this.renderGroups(bodyElem, groups));

        this.renderFooter(footerElem);
    }

    attachListeners(parentElem: HTMLElement) {
        this.listenerChangeWorkspaceName();
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
            "",
            [ACT_ADD_WORKSPACE, CLASS_ACTION_ADD],
            "Add new workspace",
            onClick => {
                this.LOG.debug("renderWorkspaceSwitcherToolings", "add workspace clicked");
                this.VIEW_MODEL.addWorkspace(prompt("Give a name for workspace"));
            }
        ));
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
    private renderFooter(parentElem: HTMLElement) {
        const dummyTextElem = document.createElement("span");
        dummyTextElem.title = "tiririri";
        parentElem.appendChild(dummyTextElem);
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
        this.VIEW_MODEL.addGroup(workspaceId, prompt("Group name?"));
    }

    private listenerChangeWorkspaceName() {

        const titleAndDescParentContainer = this.getElementsByClassName(CLASS_WORKSPACE_HEAD_TITLE)[0];
        const titleElem = titleAndDescParentContainer.querySelectorAll(":scope > h1")[0];
        const descriptionElem = titleAndDescParentContainer.querySelectorAll(":scope > span")[0];

        titleElem.addEventListener('keydown', (e) => {
            // if (e.key === 'Enter') {
            //     e.preventDefault(); // prevent new lines
            // }
        })

        titleElem.addEventListener('blur', () => {
            this.VIEW_MODEL.editWorkspaceTitle(this.id, titleElem.textContent, descriptionElem.textContent);
        });

        descriptionElem.addEventListener('keydown', (e) => {
            // if (e.key === 'Enter') {
            //     e.preventDefault(); // prevent new lines
            // }
        })

        descriptionElem.addEventListener('blur', () => {
            this.VIEW_MODEL.editWorkspaceTitle(this.id, titleElem.textContent, descriptionElem.textContent);
        });
    }

}