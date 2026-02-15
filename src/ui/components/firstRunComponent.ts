import {AppStateRepository} from "../../backend/repository/AppStateRepository";
import {FirstRunViewModel} from "../../viewModel/firstRunViewModel"

export class FirstRunComponent extends HTMLElement {

    private REPOSITORY!: AppStateRepository;
    private VIEW_MODEL: FirstRunVieeModel;

    initialize(repository: AppStateRepository): void {
        this.REPOSITORY = repository;
        this.VIEW_MODEL = new FirstRunViewModel(this.REPOSITORY);
    }

    connectedCallback() {
        this.render();
    }

    public render(): void {

        const template: string = `
            <h1>No workspaces & Groups & Links here yet.</h1>
            <h2>If You se this page, it is either first run or everything was wiped out.</h2>
            <br>
            <div>
                <h3>Start by creating Workspace</h3>
                <br>
                <button id="act-first-workspace"> + Add first workspace</button>
            </div>
            <br>
            <div>
                <h3>... or load links from backup / exported file</h3>
                <br>
                <button id="act-import-links"> &gt; Import</button>
            </div>
            <br>
            <div>
                <h3>... or load predefined examples set</h3>
                <br>
                <button id="act-load-defaults"> - Load examples</button>
            </div>
        `;

        this.innerHTML = template;
    }

    private attachButtonActions() {

    }

}