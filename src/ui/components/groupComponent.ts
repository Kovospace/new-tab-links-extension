
// constants
import {
    ELEM_LINK,
    ELEM_SUBGROUP,
    ELEM_GROUP_HEAD,
    ELEM_GROUP_FOOT,
    ELEM_GROUP_BODY,
    ACT_ADD_LINK,
    ACT_ADD_GROUP,
    ACT_EDIT_GROUP,
    CLASS_GROUP_HEAD_TITLE,
    CLASS_GROUP_HEAD_ACTIONS,
    CLASS_ACTION_ADD
} from "../../main"

// utils
import { sleep } from "../../utils/firstOrderMethods"

// data / model layer
import { AppStateRepository } from "../../backend/repository/AppStateRepository";
import { GroupViewModel } from "../../viewModel/groupViewModel";
import { LinkViewModel } from "../../viewModel/linkViewModel";
import { SubGroupViewModel } from "../../viewModel/subGroupViewModel";
import { GroupDTO, GroupItemDTO, LinkDTO, SubgroupDTO } from "../../viewModel/abstract/dtos"

// components layer
import { AbstractComponent } from "../abstract/abstractComponent"
import { LinkComponent } from "./linkComponent"
import { SubgroupComponent } from "./subgroupComponent"
import { renderTextContainer, renderButton, renderContainer, ICON } from "../../utils/elementsRendering";
import { handleReactiveRendering } from "../../utils/firstOrderMethods";
import {OptionsMenu} from "../partials/optionsMenu";



export class GroupComponent extends AbstractComponent<GroupDTO, GroupViewModel> {

    private render(parentElem: HTMLElement): void {

        // group container elements
        const headerElem: HTMLElement = document.createElement(ELEM_GROUP_HEAD);
        const separatorElem: HTMLElement = document.createElement("hr");
        const bodyElem: HTMLElement = document.createElement(ELEM_GROUP_BODY);
        const footerElem: HTMLElement = document.createElement(ELEM_GROUP_FOOT);
        parentElem.appendChild(headerElem);
        parentElem.appendChild(separatorElem);
        parentElem.appendChild(bodyElem);
        parentElem.appendChild(footerElem);

        // group head containers
        const titleSectionElem: HTMLElement = renderContainer([CLASS_GROUP_HEAD_TITLE]);
        const actionsSectionElem: HTMLElement = renderContainer([CLASS_GROUP_HEAD_ACTIONS]);
        headerElem.appendChild(titleSectionElem);
        headerElem.appendChild(actionsSectionElem);

        // group head elements
        // title
        titleSectionElem.appendChild(renderTextContainer(
            this.DTO.title, "h2", null));
        titleSectionElem.appendChild(renderTextContainer(
            this.DTO.description, "span", null));

        // buttons
        new OptionsMenu(
            actionsSectionElem,
            {
                openMenuButtonId: `group-${this.id}-menu`,
                openMenuButtonClass: ACT_EDIT_GROUP,
                openMenuButtonTooltipText: "Edit the Group"
            },
            [
                {
                    actionTitle: "Add link",
                    dangerous: false,
                    onClick: (metadata) => {}
                },
                {
                    actionTitle: "Edit Group title",
                    dangerous: false,
                    onClick: (metadata) => this.toggleGroupTitleEditable(event.target as HTMLElement)
                },
                {
                    actionTitle: "Manage links",
                    dangerous: false,
                    onClick: (metadata) => {}
                },
                {
                    actionTitle: "Delete group",
                    dangerous: true,
                    dangerConfirmation: "All links and sub-groups associated to that group will be deleted.",
                    onClick: (metadata) => this.VIEW_MODEL.deleteGroup(this.id)
                }
            ],
            {
                groupId: this.id
            }
        );

        actionsSectionElem.appendChild(renderButton(
            ICON.ADD,
            this.DTO.id,
            [ACT_ADD_LINK, CLASS_ACTION_ADD],
            "Add link to group",
            onClick => {
                this.LOG.debug(
                    "render",
                    "add link to group: " + this.title + " with id: " + this.id + " clicked");
                this.VIEW_MODEL.addLink(this.id, null, prompt("Give URL"), prompt("Give name"));
            }
        ));

        // group body elements
        // links
        this.VIEW_MODEL.observables.group
            .subscribe((attrs: GroupDTO) => this.renderGroupItems(bodyElem, attrs));
    }

    private attachListeners() {
      this.listenerChangeGroupName();
    }

    private renderGroupItems(parentElem: HTMLElement, groupDto: GroupDTO): void {
        handleReactiveRendering<GroupItemDTO, HTMLButtonElement>(
            parentElem,
            groupDto.items,
            groupItem => groupItem.id,
            groupItem => {
                switch (groupItem.type) {
                    case "link":
                        return this.renderLink(groupItem);
                    case "subgroup":
                        return this.renderSubgroup(groupItem);
                    default:
                        console.error("unsupported element");
                        return document.createElement("span");
                }
            }
        );
    }

    private renderLink(link: LinkDTO): HTMLElement {
        const linkElem = document.createElement(ELEM_LINK) as LinkComponent;
        linkElem.initialize(this.REPOSITORY, link, LinkViewModel);
        return linkElem;
    }

    private renderSubgroup(subgroup: SubgroupDTO): HTMLElement {
        const subgroupElem = document.createElement(ELEM_SUBGROUP) as SubgroupComponent;
        subgroupElem.initialize(this.REPOSITORY, subgroup, SubGroupViewModel);
        return subgroupElem;
    }

    private toggleGroupTitleEditable(menuItem: HTMLElement) {

        const titleAndDescParentContainer = this.getElementsByClassName(CLASS_GROUP_HEAD_TITLE)[0];
        const titleElem = titleAndDescParentContainer.querySelectorAll(":scope > h2")[0];
        const descriptionElem = titleAndDescParentContainer.querySelectorAll(":scope > span")[0];

        menuItem.classList.toggle("active");
        titleElem.toggleAttribute('contentEditable');
        titleElem.classList.toggle("editable");
        descriptionElem.toggleAttribute('contentEditable');
        descriptionElem.classList.toggle("editable");
        if (menuItem.classList.contains("active")) {
            setTimeout(() => { menuItem.textContent = "Save group title" }, 250);
        } else {
            setTimeout(() => { menuItem.textContent = menuItem.getAttribute('defaultText') }, 250);
        }
    }

    private listenerChangeGroupName() {

      const titleAndDescParentContainer = this.getElementsByClassName(CLASS_GROUP_HEAD_TITLE)[0];
      const titleElem = titleAndDescParentContainer.querySelectorAll(":scope > h2")[0];
      const descriptionElem = titleAndDescParentContainer.querySelectorAll(":scope > span")[0];

      titleElem.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault(); // prevent new lines
        }
      })

      titleElem.addEventListener('blur', () => {
        this.VIEW_MODEL.editGroupTitle(this.id, titleElem.textContent, descriptionElem.textContent);
      });

      descriptionElem.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault(); // prevent new lines
        }
      })

      descriptionElem.addEventListener('blur', () => {
        this.VIEW_MODEL.editGroupTitle(this.id, titleElem.textContent, descriptionElem.textContent);
      });
    }

}
