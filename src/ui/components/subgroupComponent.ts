
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
    ELEM_SUBGROUP,
    ACT_SUBGROUP_MOVE_UP,
    ACT_SUBGROUP_MOVE_DOWN,
    CLASS_SUBGROUP_MOVE_ACTIONS
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
        this.listenerChangeSubgroupTitle();
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

        // Move-up / Move-down buttons — visible only when the parent group is in "managed" mode
        const moveActionsContainer: HTMLElement = renderContainer([CLASS_SUBGROUP_MOVE_ACTIONS]);
        headElem.appendChild(moveActionsContainer);
        moveActionsContainer.appendChild(renderButton(
            ICON.MOVE_UP, this.DTO.id, [ACT_SUBGROUP_MOVE_UP], "Move subgroup up",
            (e) => { e.stopPropagation(); this.VIEW_MODEL.moveSubgroupUp(); }
        ));
        moveActionsContainer.appendChild(renderButton(
            ICON.MOVE_DOWN, this.DTO.id, [ACT_SUBGROUP_MOVE_DOWN], "Move subgroup down",
            (e) => { e.stopPropagation(); this.VIEW_MODEL.moveSubgroupDown(); }
        ));

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
                    onClick: () => this.toggleSubgroupTitleEditable(event?.target as HTMLElement)
                },
                {
                    actionTitle: "Manage links",
                    dangerous: false,
                    onClick: () => this.toggleLinksManagementOptions(event?.target as HTMLElement)
                },
                {
                    actionTitle: "Move all links out of subgroup",
                    dangerous: false,
                    onClick: () => this.VIEW_MODEL.moveLinksOutOfSubgroup(this.id)
                },
                {
                    actionTitle: "Delete subgroup & move links",
                    dangerous: true,
                    onClick: () => this.VIEW_MODEL.deleteSubgroupAndMoveLinks(this.id)
                },
                {
                    actionTitle: "Delete subgroup including links",
                    dangerous: true,
                    onClick: () => this.VIEW_MODEL.deleteSubgroup(this.id)
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

    private toggleSubgroupTitleEditable(menuItem: HTMLElement): void {
        const titleAndDescParentContainer = this.getElementsByClassName(CLASS_SUBGROUP_HEAD_TITLE)[0];
        const titleElem = titleAndDescParentContainer.querySelectorAll(":scope > h3")[0];
        const descriptionElem = titleAndDescParentContainer.querySelectorAll(":scope > span")[0];

        menuItem.classList.toggle("active");
        titleElem.toggleAttribute('contentEditable');
        titleElem.classList.toggle("editable");
        descriptionElem.toggleAttribute('contentEditable');
        descriptionElem.classList.toggle("editable");
        if (menuItem.classList.contains("active")) {
            setTimeout(() => { menuItem.textContent = "Save subgroup title" }, 250);
        } else {
            setTimeout(() => { menuItem.textContent = menuItem.getAttribute('defaultText') }, 250);
        }
    }

    private listenerChangeSubgroupTitle(): void {
        const titleAndDescParentContainer = this.getElementsByClassName(CLASS_SUBGROUP_HEAD_TITLE)[0];
        const titleElem = titleAndDescParentContainer.querySelectorAll(":scope > h3")[0];
        const descriptionElem = titleAndDescParentContainer.querySelectorAll(":scope > span")[0];

        titleElem.addEventListener('blur', () => {
            this.VIEW_MODEL.editSubgroupTitle(this.id, titleElem.textContent ?? "", descriptionElem.textContent ?? "");
        });

        descriptionElem.addEventListener('blur', () => {
            this.VIEW_MODEL.editSubgroupTitle(this.id, titleElem.textContent ?? "", descriptionElem.textContent ?? "");
        });
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