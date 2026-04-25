import {AppStateRepository} from "../backend/repository/AppStateRepository";
import {ProfileDataTransfer} from "../backend/repository/ProfileDataTransfer";
import {appStateInit} from "../backend/datasource/init/AppStateInit";

export class FirstRunViewModel {

    private REPOSITORY!: AppStateRepository;

    constructor(repository: AppStateRepository) {
        this.REPOSITORY = repository;
    }

    public addWorkspace(title: string | null | undefined, description?: string): void {
        if (!title) {
            alert("At least title is mandatory");
        }
        this.REPOSITORY
            .addWorkspace(title!, description)
            .then(() => {
                window.location.reload();
            });
    }

    public async importProfile(): Promise<void> {
        const data = await ProfileDataTransfer.importFromFile();
        if (!data) return;
        await this.REPOSITORY.replaceCurrentProfileData(data);
        window.location.reload();
    }

    public async loadDefaults(): Promise<void> {
        const { environments, groups, subgroups, links, activeEnvironmentId } = appStateInit;
        await this.REPOSITORY.replaceCurrentProfileData(
            { environments, groups, subgroups, links, activeEnvironmentId }
        );
        window.location.reload();
    }

}