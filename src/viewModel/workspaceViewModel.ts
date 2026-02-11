import {AppStateRepository} from "../backend/repository/AppStateRepository";
import {AppState, Link, Environment, Group} from "../backend/entity/AppStateEntity";
import {ObservableValue} from "../utils/observableValue";
import {LinkDTO} from "./groupViewModel";
import {Logger} from "../utils/logger";

export interface WorkspaceDTO {
    id: string;
    title: string;
    active: boolean;
}

export interface GroupDTO {
    id: string;
    title: string;
}

export class WorkspaceViewModel {

    private log: Logger = new Logger("WorkspaceViewModel");

    private repo!: AppStateRepository;
    private worksapceId!: string;

    public readonly workspacesObservable: ObservableValue<WorkspaceDTO[]> = new ObservableValue(null as any);
    public readonly groupsObservable: ObservableValue<GroupDTO> = new ObservableValue(null as any);
    public readonly workspaceObservable: ObservableValue<WorkspaceDTO> = new ObservableValue(null as any);

    constructor(repo: AppStateRepository) {
        this.repo = repo;
        this.subscriptions();
    }

    private subscriptions() {
        this.repo.state$.subscribe((state: AppState) => {

            this.log.debug('subscriptions', "triggered");
            this.log.debug('subscriptions', "incoming data: " + Object.values(state.groups).length);

            this.workspacesObservable.set(
                Object
                    .values(state.environments)
                    .sort((a, b) => a.createdAt - b.createdAt)
                    .map(environment => ({
                        id: environment.id,
                        title: environment.name,
                        active: environment.id === state.activeEnvironmentId
                    }) satisfies WorkspaceDTO));

            this.workspaceObservable.set(({
                id: state.activeEnvironmentId,
                title: state.environments[state.activeEnvironmentId].name,
                active: true
            }) satisfies WorkspaceDTO);

            this.groupsObservable.set(
                Object
                    .values(state.groups)
                    .filter((group: Group) => group.environmentId === state.activeEnvironmentId)
                    .map(this.toGroupDTO));
        });
    }

    public addWorkspace(title: string) {
        this.log.debug("addWorkspace", title);
        if (!title) {
            this.log.debug("addWorkspace", "User did not provided a title");
            return;
        }
        this.repo.addWorkspace(title);
    }

    public setCurrentWorkspace(id: string) {
        this.log.debug("setCurrentWorkspace", id);
        this.repo.setWorkspaceDefault(id);
    }

    public getGroups(workspaceId: string): GroupDTO[] {
        return this.repo
            .getGroups(workspaceId)
            .map((group: Group) => ({
                id: group.id,
                title: group.title
            }) satisfies GroupDTO);
    }

    public addGroup(workspaceId: string, title: string | null) {
        if (!workspaceId) {
            console.error("ID of workspace to be created group in is not defined");
            return;
        }
        if (!title) {
            console.log("No group will be created because user does not provided name");
            return;
        }
        this.repo.createGroup(title, workspaceId);
    }

    private toWorkspaceDTO = (workspace: Environment): WorkspaceDTO => ({
        id: workspace.id,
        title: workspace.name
    });

    private toGroupDTO = (group: Group): GroupDTO => ({
        id: group.id,
        title: group.title
    });
}