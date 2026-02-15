import {AppStateRepository} from "../backend/repository/AppStateRepository";

export class FirstRunViewModel {

    private REPOSITORY!: AppStateRepository;

    constructor(repository: AppStateRepository) {
        this.REPOSITORY = repository;
    }

    public addWorkspace(title: string, description?: string): void {
        if (!title) {
            alert("At least title is mandatory");
        }
        this.REPOSITORY
            .addWorkspace(title, description)
            .then(() => {
                window.location.reload();
            });
    }

}