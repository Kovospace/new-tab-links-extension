import {AppStateRepository} from "../../backend/repository/AppStateRepository";
import {AppState} from "../../backend/entity/AppStateEntity";
import {Logger} from "../../utils/logger";

export abstract class AbstractViewModel<TEMPLATE_DTO_TYPE, TOBS extends Record<string, ObservableValue<any>>> {

    protected LOG!: Logger;

    protected REPOSITORY!: AppStateRepository;
    protected DTO!: TEMPLATE_DTO_TYPE;

    public readonly observables: TOBS;

    constructor(dto: TEMPLATE_DTO_TYPE, repository: AppStateRepository) {
        this.LOG = new Logger(this.constructor.name);
        this.DTO = dto;
        this.REPOSITORY = repository;
    }

    public initialize(): void {
        this.observables = this.createObservables();
        this.REPOSITORY.state$.subscribe((state: AppState) => this.subscribed(state));
    }

    protected abstract createObservables();
    protected abstract subscribed(state: AppState);
}