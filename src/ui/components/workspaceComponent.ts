import {AppStateRepository} from "../../backend/repository/AppStateRepository";
import {WorkspaceDTO, WorkspaceViewModel, GroupDTO} from "../../viewModel/workspaceViewModel";
import {GroupComponent} from "./groupComponent";
import {qsAll, handleReactiveRendering, toggleActiveClassOnSpecificAttribute} from "../../utils/firstOrderMethods";
import {ELEM_GROUP, ELEM_WORKSPACE, ELEM_WORKSPACE_BODY, ELEM_WORKSPACE_HEAD, ACT_SWITCH_WORKSPACE, ACT_ADD_GROUP, ACT_EDIT_WORKSPACE, ACT_ADD_WORKSPACE} from "../../main"
import {renderButton, renderH1, renderContainer, ICON, renderSpan} from "../../utils/elementsRendering"
import {Logger} from "../../utils/logger";

export class WorkspaceComponent extends HTMLElement {

    private log: Logger = new Logger("WorkspaceComponent");

    private workspaceViewModel!: WorkspaceViewModel;
    private appStateRepository!: AppStateRepository;

    setRepository(repo: AppStateRepository) {
        this.appStateRepository = repo;
    }

    connectedCallback() {
        if (!this.appStateRepository) throw new Error("Repository not set");
        this.workspaceViewModel = new WorkspaceViewModel(this.appStateRepository);
        this.render();
        this.callbacks();
        this.listeners();
    }

    private render() {

        const headerElem: HTMLElement = document.body.getElementsByTagName("header")[0];
        const footerElem: HTMLElement = document.body.getElementsByTagName("footer")[0];
        const headElem: HTMLElement = document.createElement(ELEM_WORKSPACE_HEAD);
        const bodyElem: HTMLElement = document.createElement(ELEM_WORKSPACE_BODY);

        this.appendChild(headElem);
        this.appendChild(bodyElem);

        this.workspaceViewModel.workspacesObservable
            .subscribe((workspaces: WorkspaceDTO[]) => this.renderWorkspaceSwitcher(headerElem, workspaces));

        this.renderWorkspacesHeaderToolings(headerElem);

        this.workspaceViewModel.workspaceObservable
            .subscribe((workspace: WorkspaceDTO) => this.renderWorkspaceHead(headElem, workspace));

        this.workspaceViewModel.groupsObservable
            .subscribe((groupIds: string[]) => this.renderGroups(bodyElem, groupIds));

       this.renderFooter(footerElem);
    }

    private listeners(): void {
        // this.onAddGroupButtonClick();
    }

    private callbacks(): void {
        //this.bindComponentClassToGroupElements();
    }

    /**
     * Top menu workspace switcher content (Application header content)
     *
     * Parent to inflate:
     *
     *  <header>
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
                    this.log.debug(
                        "renderWorkspaceSwitcher",
                        "workspace switch to workspace: " + workspace.title + " with id: " + workspace.id + " clicked");
                    this.workspaceViewModel.setCurrentWorkspace(workspace.id);
                    //toggleActiveClass(event, ACT_SWITCH_WORKSPACE);
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
     *      <div></div>
     *      [[ add workspace button ]]
     *  </header>
     */
    private renderWorkspacesHeaderToolings(parentElem: HTMLElement) {

        // add workspace button
        parentElem.appendChild(renderButton(
            ICON.ADD,
            null,
            [ACT_ADD_WORKSPACE],
            "Add new workspace",
            clicked => {
                this.log.debug("renderWorkspacesHeaderToolings", "add workspace clicked");
                this.workspaceViewModel.addWorkspace(prompt("Give a name for workspace"));
            }
        ));
    }

    /**
     *  Workspace heading & workpsace top menu content
     */
    private renderWorkspaceHead(parentElem: HTMLElement, workspace: WorkspaceDTO) {

        const titleSectionElem: HTMLElement = renderContainer(["workspace-head-title"]);
        const actionsSectionElem: HTMLElement = renderContainer(["workspace-head-actions"]);
        parentElem.appendChild(titleSectionElem);
        parentElem.appendChild(actionsSectionElem);

        // ID
        this.id = workspace.id;

        // title
        titleSectionElem.appendChild(renderH1(
            workspace.title
        ));

        titleSectionElem.appendChild(renderSpan(
            "TODO prirobit do tatoveho modelu workspace description"
        ));

        // edit workspace screen
        actionsSectionElem.appendChild(renderButton(
            ICON.EDIT,
            workspace.id,
            [ACT_EDIT_WORKSPACE],
            "Opens workspaces settings dialog",
            (event) => {
                this.log.debug("open workspace settings clicked");
            }
        ));

        // add group
        actionsSectionElem.appendChild(renderButton(
            ICON.ADD,
            workspace.id,
            [ACT_ADD_GROUP],
            "Add new group",
            (event) => {
                this.log.debug("add group clicked");
                this.workspaceViewModel.addGroup(workspace.id, prompt("Group name?"))
            }
        ));
    }

    /**
     *  Workspace's groups with links and subgroups containers
     */
    private renderGroups(parentElem: HTMLElement, groups: GroupDTO[]) {
        handleReactiveRendering<GroupDTO>(
            parentElem,
            groups,
            group => group.id,
            group => {
                const groupElem = document.createElement(ELEM_GROUP) as GroupComponent;
                groupElem.title = group.title;
                groupElem.setRepository(this.appStateRepository);
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

    // private bindComponentClassToGroupElements(): void {
    //     // renders containers for groups
    //     qsAll<GroupComponent>("link-group", this)
    //         .forEach(lg => {
    //             lg.setRepository(this.appStateRepository);
    //         });
    // }

    // private onAddGroupButtonClick() {
    //     document
    //         .querySelector(`.${ACT_ADD_GROUP}`)
    //         ?.addEventListener(
    //             "click",
    //             () => this.workspaceViewModel.addGroup(this.id, prompt("Group name?")));
    // }

}