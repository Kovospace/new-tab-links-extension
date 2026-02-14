
// data / model layer
import { AppStateRepository } from "../../backend/repository/AppStateRepository";
import { LinkDTO } from "../../viewModel/abstract/dtos"
import { LinkViewModel } from "../../viewModel/linkViewModel";

// components layer
import { AbstractComponent } from "../abstract/abstractComponent"

export class LinkComponent extends AbstractComponent<LinkDTO, LinkViewModel> {

    protected render(parentElem: HTMLElement) {

        // console.log("\n");
        // console.log("----------------------------");
        // console.log("----------------------------");
        // console.log(parentElem);
        // console.log(this.DTO);
        // console.log("----------------------------");
        // console.log("----------------------------");
        // console.log("\n");
        // console.log(this.DTO.id);
        // console.log(this.id);

        this.VIEW_MODEL.observables.link
            .subscribe((linkDto: LinkDTO)=> this.renderLink(linkDto, parentElem));
    }

    protected attachListeners(parentElem: HTMLElement) {

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
    private renderLink(linkDto: LinkDTO, parentElem: HTMLElement) {

        const containerDiv: HTMLElement = document.createElement("div");
        parentElem.appendChild(containerDiv);

        const anchor: HTMLAnchorElement = document.createElement("a");
        anchor.href = linkDto.url;
        anchor.textContent = linkDto.title;
        containerDiv.appendChild(anchor);
    }

}