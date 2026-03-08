import {AppStateRepository} from "../../backend/repository/AppStateRepository";
import {AppState} from "../../backend/entity/AppStateEntity";
import {Logger} from "../../utils/logger";
import {ObservableValue} from "../../utils/observableValue";

export abstract class AbstractViewModel<TEMPLATE_DTO_TYPE> {

    protected LOG!: Logger;

    protected REPOSITORY!: AppStateRepository;
    protected DTO!: TEMPLATE_DTO_TYPE;

    public observables!: Record<string, ObservableValue<any>>;

    constructor(dto: TEMPLATE_DTO_TYPE, repository: AppStateRepository) {
        this.LOG = new Logger(this.constructor.name);
        this.DTO = dto;
        this.REPOSITORY = repository;
    }

    public initialize(): void {
        this.observables = this.createObservables();
        this.REPOSITORY.state$.subscribe((state: AppState) => this.subscribed(state));
    }

    protected abstract createObservables(): Record<string, ObservableValue<any>>;
    protected abstract subscribed(state: AppState): void;
}