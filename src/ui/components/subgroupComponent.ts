
// utils
import {OpenSubgroupAsGroupedTabsHandler} from "../backgroundWorkerCommands/openSubgroupAsGroupedTabsHandler"
import {OpenSubgroupAsIsolatedTabsHandler} from "../backgroundWorkerCommands/openSubgroupAsIsolatedTabsHandler"

// data / model layer
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
    ACT_OPEN_ALL_SUBGROUP_LINKS,
    ELEM_SUBGROUP
} from "../../main";
import {LinkComponent} from "./linkComponent";
import {LinkViewModel} from "../../viewModel/linkViewModel";
import { ICON, renderContainer, renderButton, renderTextContainer } from "../partials/wrappedHtmlElements"
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

        const subgroupTitle = renderTextContainer("h3", this.DTO.title);
        const subgroupDescription = renderTextContainer("span", this.DTO.description);
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
                    onClick: () => {
                        event?.stopPropagation();
                        this.VIEW_MODEL.addLink(
                            prompt("Give link title"), prompt("Give link URL"));
                    }
                },
                {
                    actionTitle: "Expand / Collapse group",
                    dangerous: false,
                    onClick: () => this.actionSubgroupFold(event)
                },
                {
                    actionTitle: "Open all links in grouped tabs",
                    dangerous: false,
                    onClick: () => {
                        this.actionOpenSubGroupLinks();
                    }
                },
                {
                    actionTitle: "Open all links in separated tabs",
                    dangerous: false,
                    onClick: () => {
                        this.actionOpenSubGroupLinksIsolated();
                    }
                },
                {
                    actionTitle: "Edit subgroup title & description",
                    dangerous: false,
                    onClick: () => {}
                },
                {
                    actionTitle: "Manage links",
                    dangerous: false,
                    onClick: () => this.toggleLinksManagementOptions(event?.target as HTMLElement)
                },
                {
                    actionTitle: "Move all links out of subgroup",
                    dangerous: false,
                    onClick: () => {}
                },
                {
                    actionTitle: "Delete subgroup",
                    dangerous: true,
                    onClick: () => {}
                },
            ]
        );

        subgroupActionsContainer.appendChild(renderButton(
            ICON.OPEN_GROUPED,
            this.DTO.id,
            [ACT_OPEN_ALL_SUBGROUP_LINKS],
            "Open all subgroup links in new grouped tabs",
            onClick => {
                event?.stopPropagation();
                this.actionOpenSubGroupLinks();
            }
        ));

        // subgroup links
        if (!subgroupDto.links) {
         return;
        }
        subgroupDto.links.forEach((link: LinkDTO) => {
            const linkElem: LinkComponent = document.createElement(ELEM_LINK) as LinkComponent;
            linkElem.initialize(this.REPOSITORY, link, LinkViewModel);
            bodyElem.appendChild(linkElem);
        });
    }

    private listenerOnHeadClick(thisElem: HTMLElement): void {
        thisElem
            .getElementsByTagName(ELEM_SUBGROUP_HEAD)[0]
            .addEventListener('click', () => this.actionSubgroupFold(event));
    }

    private actionSubgroupFold(event: Event | undefined): void {
        if (!event) {
            return;
        }
        const elem: HTMLElement = event.target as HTMLElement;
        if (!elem) {
            return;
        }
        elem.getElementsByTagName(ELEM_SUBGROUP_BODY)[0].classList.toggle("rolled");
    }

    private actionOpenSubGroupLinks(): void {
        if (!this.DTO.links) {
            return;
        }
        OpenSubgroupAsGroupedTabsHandler.handleGroupedTabsOpen(
            this.DTO.links.map(link => link.url), this.DTO.title);
    }

    private toggleLinksManagementOptions(menuItem: HTMLElement): void {
        this.getElementsByTagName(ELEM_SUBGROUP_BODY)[0].classList.toggle("managed");
        if (this.getElementsByTagName(ELEM_SUBGROUP_BODY)[0].classList.contains("managed")) {
            setTimeout(() => { menuItem.textContent = "Finish links editing" }, 250);
        } else {
            setTimeout(() => { menuItem.textContent = "Manage links" }, 250);
        }
    }

    private actionOpenSubGroupLinksIsolated(): void {
        if (!this.DTO.links) {
            return;
        }
        OpenSubgroupAsIsolatedTabsHandler.handleIsolatedTabsOpen(
            this.DTO.links.map(link => link.url));
    }
}