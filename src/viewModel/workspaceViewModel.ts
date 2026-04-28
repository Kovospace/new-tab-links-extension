
// data layer
import {AppState, Environment, Group, ProfileMeta} from "../backend/entity/AppStateEntity";

// model layer
import {AbstractViewModel} from "../viewModel/abstract/abstractViewModel"
import {WorkspaceDTO, GroupDTO, ProfileDTO} from "../viewModel/abstract/dtos"
import {toGroupDTO} from "../viewModel/abstract/mappers"

// repositories
import {profileRepository} from "../backend/repository/ProfileRepository";
import {ProfileDataTransfer} from "../backend/repository/ProfileDataTransfer";

// utils
import {ObservableValue} from "../utils/observableValue";

type WorkspaceObservables = {
    workspaces: ObservableValue<WorkspaceDTO[]>;
    groups: ObservableValue<GroupDTO>;
    workspace: ObservableValue<WorkspaceDTO>;
    profiles: ObservableValue<ProfileDTO[]>;
};

export class WorkspaceViewModel extends AbstractViewModel<WorkspaceDTO> {

    protected createObservables(): WorkspaceObservables {
        return {
            workspaces: new ObservableValue([] as WorkspaceDTO[]),
            groups: new ObservableValue(null as any),
            workspace: new ObservableValue(null as any),
            profiles: new ObservableValue([] as ProfileDTO[])
        };
    }

    public override initialize(): void {
        super.initialize();
        // Subscribe to profile list changes (profile added / deleted)
        profileRepository.profiles$.subscribe((profiles: ProfileMeta[]) => {
            const activeId = this.REPOSITORY.getActiveProfileId();
            this.observables.profiles.set(profiles.map(p => ({
                id: p.id,
                name: p.name,
                active: p.id === activeId
            } satisfies ProfileDTO)));
        });
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
                .sort((a: Group, b: Group) => (a.order ?? 0) - (b.order ?? 0))
                .map(toGroupDTO));

        // Update active flag on profiles when the loaded profile changes
        const profiles = profileRepository.profiles$.get();
        if (profiles.length > 0) {
            this.observables.profiles.set(profiles.map(p => ({
                id: p.id,
                name: p.name,
                active: p.id === state.activeProfileId
            } satisfies ProfileDTO)));
        }
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

    // profile actions

    public switchProfile(id: string) {
        this.LOG.debug("switchProfile", `id: ${id}`);
        profileRepository.setActiveProfile(id);
        this.REPOSITORY.switchProfile(id);
    }

    public async createProfile(name: string | null) {
        this.LOG.debug("createProfile", `name: ${name}`);
        if (!name) return;
        const meta = await profileRepository.createProfile(name);
        this.switchProfile(meta.id);
    }

    public async importProfile() {
        const data = await ProfileDataTransfer.importFromFile();
        if (!data) return;

        const name = prompt("Name for the imported profile?");
        if (!name) return;

        const meta = await profileRepository.createProfile(name);
        await this.REPOSITORY.saveProfileData(meta.id, data);
        this.switchProfile(meta.id);
    }

    public exportCurrentProfile() {
        const state = this.REPOSITORY.state$.get();
        const activeProfileId = state.activeProfileId;
        const profileMeta = profileRepository.profiles$.get()
            .find(p => p.id === activeProfileId);
        const filename = profileMeta?.name ?? activeProfileId;

        const { environments, groups, subgroups, links, activeEnvironmentId } = state;
        ProfileDataTransfer.exportToFile(
            { environments, groups, subgroups, links, activeEnvironmentId },
            filename
        );
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