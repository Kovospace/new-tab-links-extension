import {AppStateRepository} from "../../backend/repository/AppStateRepository";
import {Logger} from "../../utils/logger";

type ViewModelConstructor<TEMPLATE_DTO_TYPE, VIEW_MODEL_TYPE> =
    new (repository: AppStateRepository, dto: TEMPLATE_DTO_TYPE) => VIEM_MODEL_TYPE;

export abstract class AbstractComponent<TEMPLATE_DTO_TYPE, VIEW_MODEL_TYPE> extends HTMLElement {

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

    initialize<TEMPLATE_DTO_TYPE, VIEW_MODEL_TYPE>(
        repository: AppStateRepository,
        dto: TEMPLATE_DTO_TYPE,
        viemModelClass: ViewModelConstructor<TEMPLATE_DTO_TYPE, VIEW_MODEL_TYPE>
    ) {
        this.REPOSITORY = repository;
        this.DTO = dto;
        this.viewModelConstructor = viemModelClass;
        this.performInitialization();
        // console.log("------------ initialize method");
        // console.log(this.REPOSITORY);
        // console.log("DTO snapshot:", structuredClone(this.DTO));
        // console.log(this.LOG);
    }

    private performInitialization() {
        if (!this.isConnected || !this.REPOSITORY || !this.DTO) return;
        this.VIEW_MODEL = new this.viewModelConstructor(this.DTO, this.REPOSITORY);
        this.VIEW_MODEL.initialize();
        console.log("this.id " + this.id);
        console.log("this.DTO.id " + this.DTO.id);

        // let id: string = "";
        // if (this.id === undefined || this.id === null || this.id === "") {
        //     id = this.DTO.id;
        // }

        this.id = this.DTO.id;

        const parentElem: HTMLElement | null = document.getElementById(this.id);
        // console.log("------------------------");
        // console.log(this.id);
        // console.log(this.DTO.id);
        // console.log("------------------------");
        this.render(parentElem);
        this.attachListeners(parentElem);
    }

    protected abstract render(parent: HTMLElement): void;
    protected abstract attachListeners(parent: HTMLElement): void;
}