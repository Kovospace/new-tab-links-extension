
// data layer
import {AppState, Environment, Group} from "../backend/entity/AppStateEntity";

// model layer
import {AbstractViewModel} from "../viewModel/abstract/abstractViewModel"
import {WorkspaceDTO, GroupDTO} from "../viewModel/abstract/dtos"
import {toGroupDTO} from "../viewModel/abstract/mappers"

// utils
import {ObservableValue} from "../utils/observableValue";

type WorkspaceObservables = {
    workspaces: ObservableValue<WorkspaceDTO[]>;
    groups: ObservableValue<GroupDTO>;
    workspace: ObservableValue<WorkspaceDTO>;
};

export class WorkspaceViewModel extends AbstractViewModel<WorkspaceDTO> {

    protected createObservables(): WorkspaceObservables {
        return {
            workspaces: new ObservableValue([] as WorkspaceDTO[]),
            groups: new ObservableValue(null as any),
            workspace: new ObservableValue(null as any)
        };
    }

    protected subscribed(state: AppState) {

        this.LOG.debug('subscriptions', "incoming data: " + Object.values(state));

        const currentWorkspaceId: string = state.activeEnvironmentId!;
        if (!currentWorkspaceId) {
            // no active workspace - first run or all deleted
            window.location.reload();
        }

        this.observables.workspaces.set(
            Object
                .values(state.environments)
                .sort((a: Environment, b: Environment) => a.createdAt - b.createdAt)
                .map((environment: Environment) => ({
                    id: environment.id,
                    title: environment.name,
                    //description: environment.description,
                    active: environment.id === currentWorkspaceId
                }) satisfies WorkspaceDTO));

        this.observables.workspace.set(({
            id: currentWorkspaceId,
            title: state.environments[currentWorkspaceId].name,
            description: state.environments[currentWorkspaceId].description,
            active: true
        }) satisfies WorkspaceDTO);

        this.observables.groups.set(
            Object
                .values(state.groups)
                .filter((group: Group) => group.environmentId === currentWorkspaceId)
                .map(toGroupDTO));
    }

    // workspace actions

    public addWorkspace(title: string | null) {
        this.LOG.debug("addWorkspace", `title: ${title}`);
        if (!title) {
            this.LOG.debug("addWorkspace", "User did not provided a title");
            return;
        }
        this.REPOSITORY.addWorkspace(title);
    }

    public editWorkspaceTitle(id: string, title: string, description?: string) {
        this.LOG.debug("editWorkspaceTitle", `id: ${id}, title: ${title}, description:${description}`);
        title = title.trim();
        if (!title || title === "") {
            console.error("Workspace name cannot be empty")
        }
        this.REPOSITORY.renameWorkspace(id, title, description);
    }

    public setCurrentWorkspace(id: string) {
        this.LOG.debug("setCurrentWorkspace", `id: ${id}`);
        this.REPOSITORY.setWorkspaceDefault(id);
    }

    public getGroups(workspaceId: string): GroupDTO[] {
        return this.REPOSITORY
            .getGroups(workspaceId)
            .map(toGroupDTO);
    }

    public deleteWorkspace(id: string) {
        this.LOG.debug("deleteWorskpace", `id: ${id}`);
        this.REPOSITORY.deleteWorksapce(id);
    }

    // other actions

    public addGroup(workspaceId: string, title: string | null) {
        this.LOG.debug("addGroup", `title: ${title}`);
        if (!workspaceId) {
            console.error("ID of workspace to be created group in is not defined");
            return;
        }
        if (!title) {
            console.log("No group will be created because user does not provided name");
            return;
        }
        this.REPOSITORY.createGroup(title, workspaceId);
    }

}