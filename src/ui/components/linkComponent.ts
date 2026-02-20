
// data / model layer
import { AppStateRepository } from "../../backend/repository/AppStateRepository";
import { LinkDTO } from "../../viewModel/abstract/dtos"
import { LinkViewModel } from "../../viewModel/linkViewModel";

// components layer
import { AbstractComponent } from "../abstract/abstractComponent"
import { renderButton, ICON, renderContainer } from "../../utils/elementsRendering"
import { ACT_LINK_DELETE, ACT_LINK_EDIT, ACT_LINK_MOVE_UP, ACT_LINK_MOVE_DOWN,
    CLASS_LINK_ACTIONS_CONTAINER, CLASS_LINK_TEXT, CLASS_LINK_ICON, CLASS_ACTION_ADD,
    CLASS_ACTION_ACTIVE, CLASS_ACTION_DANGER } from "../../main";

// utils
import {FaviconsHandler} from "../../utils/faviconsHandler";

export class LinkComponent extends AbstractComponent<LinkDTO, LinkViewModel> {

    protected render(parentElem: HTMLElement) {

        this.VIEW_MODEL.observables.link
            .subscribe((linkDto: LinkDTO)=> this.renderLink(linkDto, parentElem));
    }

    protected attachListeners(parentElem: HTMLElement) {
        this.listenerOpenLink();
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
        const faviconDiv: HTMLElement = renderContainer([CLASS_LINK_ICON]);
        parentElem.appendChild(faviconDiv);

        const linkContentDiv: HTMLElement = renderContainer([CLASS_LINK_TEXT]);
        parentElem.appendChild(linkContentDiv);

        const linkActionsDiv: HTMLElement = renderContainer([CLASS_LINK_ACTIONS_CONTAINER]);
        parentElem.appendChild(linkActionsDiv);

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

        // "manage links" actions
        linkActionsDiv.appendChild(renderButton(
            ICON.MOVE_UP, this.DTO.id, [ACT_LINK_MOVE_UP], "Move link up", onClick => {
                event.stopPropagation();
            }));

        linkActionsDiv.appendChild(renderButton(
            ICON.MOVE_DOWN, this.DTO.id, [ACT_LINK_MOVE_DOWN], "Move link down", onClick => {
                event.stopPropagation();;
            }));

        linkActionsDiv.appendChild(renderButton(
            ICON.DELETE, this.DTO.id, [ACT_LINK_DELETE, CLASS_ACTION_DANGER], "Delete link", onClick => {
                event.stopPropagation();
            }));

        linkActionsDiv.appendChild(renderButton(
            ICON.EDIT, this.DTO.id, [ACT_LINK_EDIT], "Delete link", onClick => {
                event.stopPropagation();
            }));
    }

    private listenerOpenLink() {
        this.addEventListener('click', () => {
            window.location.href = this.DTO.url;
        });
    }

}