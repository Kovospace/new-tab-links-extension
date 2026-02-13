import {AppStateRepository} from "../backend/repository/AppStateRepository";
import {AppState, Link, Environment, Group} from "../backend/entity/AppStateEntity";
import {ObservableValue} from "../utils/observableValue";
import {LinkDTO} from "./groupViewModel";
import {Logger} from "../utils/logger";
import {AbstractViewModel} from "../viewModel/abstract/abstractViewModel"
import {WorkpsaceDTO, GroupDTO} from "../viewModel/abstract/dtos"
import {toGroupDTO} from "../viewModel/abstract/mappers"

// export interface WorkspaceDTO {
//     id: string;
//     title: string;
//     active: boolean;
// }
//
// export interface GroupDTO {
//     id: string;
//     title: string;
//     description: string;
// }

type WorkspaceObservables = {
    workspaces: ObservableValue<WorkpsaceDTO[]>;
    groups: ObservableValue<GroupDTO>;
    workspace: ObservableValue<WorkpsaceDTO>;
};

export class WorkspaceViewModel extends AbstractViewModel<WorkspaceDTO, WorkspaceObservables> {

    // private repo!: AppStateRepository;
    // private worksapceId!: string;

    // public readonly workspacesObservable: ObservableValue<WorkspaceDTO[]> = new ObservableValue(null as any);
    // public readonly groupsObservable: ObservableValue<GroupDTO> = new ObservableValue(null as any);
    // public readonly workspaceObservable: ObservableValue<WorkspaceDTO> = new ObservableValue(null as any);

    // constructor(repo: AppStateRepository) {
    //     this.repo = repo;
    //     this.subscriptions();
    // }

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
                .sort((a, b) => a.createdAt - b.createdAt)
                .map(environment => ({
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

    // private toWorkspaceDTO = (workspace: Environment): WorkspaceDTO => ({
    //     id: workspace.id,
    //     title: workspace.name
    // });
    //
    // private toGroupDTO = (group: Group): GroupDTO => ({
    //     id: group.id,
    //     title: group.title,
    //     description: group.description
    // });
}