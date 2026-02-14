
// data / model layer
import { AppStateRepository } from "../../backend/repository/AppStateRepository";
import { SubgroupDTO, LinkDTO } from "../../viewModel/abstract/dtos"
import { SubGroupViewModel } from "../../viewModel/subGroupViewModel";

// components layer
import { AbstractComponent } from "../abstract/abstractComponent"
import {ELEM_LINK} from "../../main";
import {LinkComponent} from "./linkComponent";
import {LinkViewModel} from "../../viewModel/linkViewModel";



export class SubgroupComponent extends AbstractComponent<SubgroupDTO, SubGroupViewModel> {

    protected render(parentElem: HTMLElement) {

        this.VIEW_MODEL.observables.subgroup
            .subscribe((subGroup: SubgroupDTO) => this.renderSubGroup(parentElem, subGroup));
    }

    protected attachListeners(parentElem: HTMLElement) {

    }

    private renderSubGroup(parentElem: HTMLElement, subgroupDto: SubgroupDTO) {

        //TODO for now only append links
        subgroupDto.links.forEach((link: LinkDTO) => {
            const linkElem: LinkComponent = document.createElement(ELEM_LINK) as LinkComponent;
            //linkElem.id = link.id;
            linkElem.initialize(this.REPOSITORY, link, LinkViewModel);
            this.appendChild(linkElem);
        });
    }
}