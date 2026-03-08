import {AppStateRepository} from "../../backend/repository/AppStateRepository";
import {Logger} from "../../utils/logger";
import {AbstractViewModel} from "../../viewModel/abstract/abstractViewModel";
import {ViewModelDTO} from "../../viewModel/abstract/dtos";

type ViewModelConstructor<
    TEMPLATE_DTO_TYPE extends ViewModelDTO,
    VIEW_MODEL_TYPE extends AbstractViewModel<TEMPLATE_DTO_TYPE>
> = new (dto: TEMPLATE_DTO_TYPE, repository: AppStateRepository) => VIEW_MODEL_TYPE;

export abstract class AbstractComponent<
    TEMPLATE_DTO_TYPE extends ViewModelDTO,
    VIEW_MODEL_TYPE extends AbstractViewModel<TEMPLATE_DTO_TYPE>
> extends HTMLElement {

    private viewModelConstructor!: ViewModelConstructor<TEMPLATE_DTO_TYPE, VIEW_MODEL_TYPE>;

    protected LOG!: Logger;
    protected REPOSITORY!: AppStateRepository;
    protected DTO!: TEMPLATE_DTO_TYPE;
    protected VIEW_MODEL!: VIEW_MODEL_TYPE;

    constructor() {
        super();
        this.LOG = new Logger(this.constructor.name);
    }

    connectedCallback() {
        this.performInitialization();
    }

    initialize(
        repository: AppStateRepository,
        dto: TEMPLATE_DTO_TYPE,
        viemModelClass: ViewModelConstructor<TEMPLATE_DTO_TYPE, VIEW_MODEL_TYPE>
    ) {
        this.REPOSITORY = repository;
        this.DTO = dto;
        this.viewModelConstructor = viemModelClass;
        this.performInitialization();
    }

    private performInitialization() {
        if (!this.isConnected || !this.REPOSITORY || !this.DTO) return;
        this.VIEW_MODEL = new this.viewModelConstructor(this.DTO, this.REPOSITORY);
        this.VIEW_MODEL.initialize();
        this.id = this.DTO.id;
        const parentElem: HTMLElement | null = document.getElementById(this.id);
        if (!parentElem) {
            console.error(`No parent element found by ID: ${this.id}`);
            return;
        }
        this.render(parentElem);
        this.attachListeners(parentElem);
    }

    protected abstract render(parent: HTMLElement): void;
    protected abstract attachListeners(parent: HTMLElement): void;
}