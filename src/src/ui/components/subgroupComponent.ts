import {AppStateRepository} from "../../backend/repository/AppStateRepository";

export class SubgroupComponent extends HTMLElement {

    private appStateRepository!: AppStateRepository;

    setRepository(repo: AppStateRepository) {
        this.appStateRepository = repo;
    }

}