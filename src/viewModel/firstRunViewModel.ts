import {AppStateRepository} from "../backend/repository/AppStateRepository";

export class FirstRunViewModel {

    private REPOSITORY!: AppStateRepository;

    constructor(repository: AppStateRepository) {
        this.REPOSITORY = repository;
    }

}