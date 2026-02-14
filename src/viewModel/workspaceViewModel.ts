
// data layer
import {AppStateRepository} from "../backend/repository/AppStateRepository";
import {AppState, Environment, Group} from "../backend/entity/AppStateEntity";

// model layer
import {AbstractViewModel} from "../viewModel/abstract/abstractViewModel"
import {WorkpsaceDTO, GroupDTO} from "../viewModel/abstract/dtos"
import {toGroupDTO} from "../viewModel/abstract/mappers"

// utils
import {ObservableValue} from "../utils/observableValue";

type WorkspaceObservables = {
    workspaces: ObservableValue<WorkpsaceDTO[]>;
    groups: ObservableValue<GroupDTO>;
    workspace: ObservableValue<WorkpsaceDTO>;
};

export class WorkspaceViewModel extends AbstractViewModel<WorkspaceDTO, WorkspaceObservables> {

    protected createObservables(): WorkspaceObservables {
        return {
            workspaces: new ObservableValue([]),
            groups: new ObservableValue(null as any),
            workspace: new ObservableValue(null as any)
        };
    }

    protected subscribed(state: AppState) {

        this.LOG.debug('subscriptions', "triggered");
        this.LOG.debug('subscriptions', "incoming data: " + Object.values(state.groups).length);

        this.observables.workspaces.set(
            Object
                .values(state.environments)
                .sort((a: Environment, b: Environment) => a.createdAt - b.createdAt)
                .map((environment: Environment) => ({
                    id: environment.id,
                    title: environment.name,
                    active: environment.id === state.activeEnvironmentId
                }) satisfies WorkpsaceDTO));

        this.observables.workspace.set(({
            id: state.activeEnvironmentId,
            title: state.environments[state.activeEnvironmentId].name,
            active: true
        }) satisfies WorkpsaceDTO);

        this.observables.groups.set(
            Object
                .values(state.groups)
                .filter((group: Group) => group.environmentId === state.activeEnvironmentId)
                .map(toGroupDTO));
    }

    public addWorkspace(title: string) {
        this.LOG.debug("addWorkspace", title);
        if (!title) {
            this.LOG.debug("addWorkspace", "User did not provided a title");
            return;
        }
        this.REPOSITORY.addWorkspace(title);
    }

    public setCurrentWorkspace(id: string) {
        this.LOG.debug("setCurrentWorkspace", id);
        this.REPOSITORY.setWorkspaceDefault(id);
    }

    public getGroups(workspaceId: string): GroupDTO[] {
        return this.REPOSITORY
            .getGroups(workspaceId)
            .map(toGroupDTO);
    }

    public addGroup(workspaceId: string, title: string | null) {
        if (!workspaceId) {
            console.error("ID of workspace to be created group in is not defined");
            return;
        }
        if (!title) {
            console.LOG("No group will be created because user does not provided name");
            return;
        }
        this.REPOSITORY.createGroup(title, workspaceId);
    }

}