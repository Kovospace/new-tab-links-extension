import {AppStateRepository} from "../../backend/repository/AppStateRepository";
import {FirstRunViewModel} from "../../viewModel/firstRunViewModel"
import { ACT_FIRST_WORKSPACE, ACT_IMPORT_LINKS, ACT_LOAD_DEFAUTLS } from "../../main"

export class FirstRunComponent extends HTMLElement {

    private REPOSITORY!: AppStateRepository;
    private VIEW_MODEL: FirstRunVieeModel;

    initialize(repository: AppStateRepository): void {
        this.REPOSITORY = repository;
        this.VIEW_MODEL = new FirstRunViewModel(this.REPOSITORY);
    }

    connectedCallback() {
       this.start();
    }

    start(): void {
        this.render();
        this.attachButtonActions();
    }

    public render(): void {

        const template: string = `
            <h1>No workspaces & Groups & Links here yet.</h1>
            <h2>If You se this page, it is either first run or everything was wiped out.</h2>
            <br>
            <div>
                <h3>Start by creating Workspace</h3>
                <br>
                <button id="${ACT_FIRST_WORKSPACE}"> + Add first workspace</button>
            </div>
            <br>
            <div>
                <h3>... or load links from backup / exported file</h3>
                <br>
                <button id="${ACT_IMPORT_LINKS}"> &gt; Import</button>
            </div>
            <br>
            <div>
                <h3>... or load predefined examples set</h3>
                <br>
                <button id="${ACT_LOAD_DEFAUTLS}"> - Load examples</button>
            </div>
        `;

        this.innerHTML = template;
    }

    private attachButtonActions() {

        this
            .querySelector<HTMLButtonElement>(`#${ACT_FIRST_WORKSPACE}`)
            .addEventListener('click', () => {
                this.VIEW_MODEL.addWorkspace(prompt("Give a name for workspace"), "Default workspace");
            });
    }

}