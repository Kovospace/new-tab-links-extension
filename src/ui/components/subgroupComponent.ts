
// data / model layer
import { AppStateRepository } from "../../backend/repository/AppStateRepository";
import { SubgroupDTO, LinkDTO } from "../../viewModel/abstract/dtos"
import { SubGroupViewModel } from "../../viewModel/subGroupViewModel";

// components layer
import { AbstractComponent } from "../abstract/abstractComponent"
import {
    ELEM_LINK,
    ELEM_SUBGROUP_HEAD,
    ELEM_SUBGROUP_BODY,
    ACT_EDIT_GROUP,
    CLASS_SUBGROUP_HEAD_TITLE,
    CLASS_SUBGROUP_HEAD_ACTIONS,
    ACT_ADD_LINK,
    CLASS_ACTION_ADD,
    ACT_OPEN_ALL_SUBGROUP_LINKS,
    ELEM_SUBGROUP
} from "../../main";
import {LinkComponent} from "./linkComponent";
import {LinkViewModel} from "../../viewModel/linkViewModel";
import {ICON, renderButton, renderContainer, renderTextContainer} from "../../utils/elementsRendering"
import { OptionsMenu } from "../partials/optionsMenu"



export class SubgroupComponent extends AbstractComponent<SubgroupDTO, SubGroupViewModel> {

    protected render(parentElem: HTMLElement) {

        this.VIEW_MODEL.observables.subgroup
            .subscribe((subGroup: SubgroupDTO) => this.renderSubGroup(parentElem, subGroup));
    }

    protected attachListeners(parentElem: HTMLElement) {
        this.listenerOnHeadClick(parentElem);
    }

    private renderSubGroup(parentElem: HTMLElement, subgroupDto: SubgroupDTO) {

        const headElem: HTMLElement = document.createElement(ELEM_SUBGROUP_HEAD);
        this.appendChild(headElem);

        // const separator: HTMLElement = document.createElement("hr");
        // this.appendChild(separator);

        const bodyElem: HTMLElement = document.createElement(ELEM_SUBGROUP_BODY);
        this.appendChild(bodyElem);

        // subgroup head
        const subgroupInfoContainer: HTMLElement = renderContainer([CLASS_SUBGROUP_HEAD_TITLE]);
        headElem.appendChild(subgroupInfoContainer);

        const subgroupTitle = renderTextContainer(this.DTO.title, "h3", null, []);
        const subgroupDescription = renderTextContainer(this.DTO.description, "span", null, []);
        subgroupInfoContainer.appendChild(subgroupTitle);
        subgroupInfoContainer.appendChild(subgroupDescription);

        const subgroupActionsContainer: HTMLElement = renderContainer([CLASS_SUBGROUP_HEAD_ACTIONS]);
        headElem.appendChild(subgroupActionsContainer);

        new OptionsMenu(
            subgroupActionsContainer,
            {
                openMenuButtonId: `subgroup-${this.id}-menu`,
                openMenuButtonClass: ACT_EDIT_GROUP,
                openMenuButtonTooltipText: "Edit the Group"
            },
            [
                {
                    actionTitle: "Add link",
                    dangerous: false,
                    onClick: (metadata) => {
                        event.stopPropagation();
                        this.VIEW_MODEL.addLink(
                            prompt("Give link title"), prompt("Give link URL"));
                    }
                },
                {
                    actionTitle: "Expand / Collapse group",
                    dangerous: false,
                    onClick: (metadata) => {
                        this.actionSubgroupFold(event.target.closest(ELEM_SUBGROUP));
                    }
                },
                {
                    actionTitle: "Open all links in grouped tabs",
                    dangerous: false,
                    onClick: (metadata) => {}
                },
                {
                    actionTitle: "Open all links in separated tabs",
                    dangerous: false,
                    onClick: (metadata) => {}
                },
                {
                    actionTitle: "Edit subgroup title & description",
                    dangerous: false,
                    onClick: (metadata) => {}
                },
                {
                    actionTitle: "Manage links",
                    dangerous: false,
                    onClick: (metadata) => {}
                },
                {
                    actionTitle: "Move all links out of subgroup",
                    dangerous: false,
                    onClick: (metadata) => {}
                },
                {
                    actionTitle: "Delete subgroup",
                    dangerous: true,
                    onClick: (metadata) => {}
                },
            ]
        );

        subgroupActionsContainer.appendChild(renderButton(
            ICON.OPEN_GROUPED,
            this.DTO.id,
            [ACT_OPEN_ALL_SUBGROUP_LINKS],
            "Open all subgroup links in new grouped tabs",
            onClick => {
                event.stopPropagation();
                //this.actionAddLink();
            }
        ));

        // subgroup links
        subgroupDto.links.forEach((link: LinkDTO) => {
            const linkElem: LinkComponent = document.createElement(ELEM_LINK) as LinkComponent;
            linkElem.initialize(this.REPOSITORY, link, LinkViewModel);
            bodyElem.appendChild(linkElem);
        });
    }

    private listenerOnHeadClick(thisElem: HTMLElement): void {
        thisElem
            .getElementsByTagName(ELEM_SUBGROUP_HEAD)[0]
            .addEventListener('click', () => {
                this.actionSubgroupFold(event.target.closest(ELEM_SUBGROUP));
            });
    }

    private actionSubgroupFold(subGroupElem: HTMLElement): void {
        console.log(subGroupElem);
        subGroupElem.getElementsByTagName(ELEM_SUBGROUP_BODY)[0].classList.toggle("rolled");
    }
}