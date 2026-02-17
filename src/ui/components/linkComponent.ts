
// data / model layer
import { AppStateRepository } from "../../backend/repository/AppStateRepository";
import { LinkDTO } from "../../viewModel/abstract/dtos"
import { LinkViewModel } from "../../viewModel/linkViewModel";

// components layer
import { AbstractComponent } from "../abstract/abstractComponent"
import {FaviconsHandler} from "../../utils/faviconsHandler";

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

        const span: HTMLSpanElement = document.createElement("span");
        span.textContent = linkDto.description;
        containerDiv.appendChild(span);

        // const img: HTMLImageElement = document.createElement("img");
        // img.width = 32;
        // img.height = 32;
        // FaviconsHandler.get(linkDto.url).then(src => {
        //     img.src = src;
        // });
        // containerDiv.appendChild(img);

        chrome.runtime.sendMessage(
            { type: "FETCH_FAVICON", url: "https://github.com" },
            res => {
              if (res?.ok) {
                console.log("RES OK");
                console.log(res.buffer);
                const byteArray = new Uint8Array(res.buffer);
                console.log(byteArray);
                const blob = new Blob([byteArray], { type: "image/png" });
                console.log(blob);
                // const blob = new Blob([res.buffer], { type: "image/x-icon" });
                // resolve(blob);
                const image = URL.createObjectURL(blob);
                console.log(image);

                const img: HTMLImageElement = document.createElement("img");
                img.width = 32;
                img.height = 32;
                //FaviconsHandler.get(linkDto.url).then(src => {
                    img.src = image;
                // });
                containerDiv.appendChild(img);

              }
              else console.log("picu z toho");
            }
        );
    }

}