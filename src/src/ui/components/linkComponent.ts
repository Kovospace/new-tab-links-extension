import {AppStateRepository} from "../../backend/repository/AppStateRepository";
import {LinkViewModel, LinkDTO} from "../../viewModel/linkViewModel";

export class LinkComponent extends HTMLElement{

    private linkViewModel!: LinkViewModel;
    private appStateRepository!: AppStateRepository;

    setRepository(repo: AppStateRepository) {
        this.appStateRepository = repo;
        // console.log("set repo");
        this.tryInit();
    }

    connectedCallback() {
        // console.log("callbacks");
        this.tryInit();
    }

    tryInit() {
        if (!this.isConnected || !this.appStateRepository || !this.id) return;
        // console.log("inited");
        this.linkViewModel = new LinkViewModel(this.appStateRepository, this.id);
        this.render();
        this.callbacks();
    }

    render() {
        this.linkViewModel.linkObservable
            .subscribe((linkDto: LinkDTO)=> {
                this.renderHtmlTemplate(linkDto);
            });
    }

    /**
     * Link in the group content. Does not dependent if is direct item of group or item in sub-group.
     *
     * Parent to inflate:
     *
     *  <link-container id="[[ this.id ]]"></link-container>
     *
     * Rendered content:
     *
     *  <div>
     *      <a href="[[ LinkDTO.url ]]">[[ LinkDTO.title ]]</a>
     *  </div>
     */
    private renderHtmlTemplate(linkDto: LinkDTO) {
        const parentElem: HTMLElement | null = document.getElementById(this.id);

        const containerDiv: HTMLElement = document.createElement("div");
        parentElem.appendChild(containerDiv);

        const anchor: HTMLAnchorElement = document.createElement("a");
        anchor.href = linkDto.url;
        anchor.textContent = linkDto.title;
        containerDiv.appendChild(anchor);
    }

    private callbacks() {

    }
}