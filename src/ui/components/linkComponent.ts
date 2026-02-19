
// data / model layer
import { AppStateRepository } from "../../backend/repository/AppStateRepository";
import { LinkDTO } from "../../viewModel/abstract/dtos"
import { LinkViewModel } from "../../viewModel/linkViewModel";

// components layer
import { AbstractComponent } from "../abstract/abstractComponent"
import {FaviconsHandler} from "../../utils/faviconsHandler";

export class LinkComponent extends AbstractComponent<LinkDTO, LinkViewModel> {

    protected render(parentElem: HTMLElement) {

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

        // containers
        const faviconDiv: HTMLElement = document.createElement("div");
        parentElem.appendChild(faviconDiv);

        const linkContentDiv: HTMLElement = document.createElement("div");
        parentElem.appendChild(linkContentDiv);

        // link
        const anchor: HTMLAnchorElement = document.createElement("a");
        anchor.href = linkDto.url;
        anchor.textContent = linkDto.title;
        linkContentDiv.appendChild(anchor);

        // description
        const span: HTMLSpanElement = document.createElement("span");
        span.textContent = linkDto.description;
        linkContentDiv.appendChild(span);

        // icon
        const img: HTMLImageElement = document.createElement("img");
        img.width = 32;
        img.height = 32;

        FaviconsHandler
            .handleIconDownloadAndCache(anchor.href)
            .then(base64 => { img.src = base64 });

        faviconDiv.appendChild(img);
    }

}