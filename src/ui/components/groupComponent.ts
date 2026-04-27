
// constants
import {
    ELEM_LINK,
    ELEM_SUBGROUP,
    ELEM_GROUP_HEAD,
    ELEM_GROUP_FOOT,
    ELEM_GROUP_BODY,
    ACT_ADD_LINK,
    ACT_EDIT_GROUP,
    CLASS_GROUP_HEAD_TITLE,
    CLASS_GROUP_HEAD_ACTIONS,
    CLASS_ACTION_ADD
} from "../../main"

// utils

// data / model layer
import { GroupViewModel } from "../../viewModel/groupViewModel";
import { LinkViewModel } from "../../viewModel/linkViewModel";
import { SubGroupViewModel } from "../../viewModel/subGroupViewModel";
import { GroupDTO, GroupItemDTO, LinkDTO, SubgroupDTO } from "../../viewModel/abstract/dtos"

// components layer
import { AbstractComponent } from "../abstract/abstractComponent"
import { LinkComponent } from "./linkComponent"
import { SubgroupComponent } from "./subgroupComponent"
import { ICON, renderContainer, renderButton, renderTextContainer } from "../../ui/partials/wrappedHtmlElements"
import {OptionsMenu} from "../partials/optionsMenu";



export class GroupComponent extends AbstractComponent<GroupDTO, GroupViewModel> {

    render(parentElem: HTMLElement): void {

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

        // title — rendered reactively via the group observable (same pattern as workspaceComponent)

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
                    onClick: () => this.actionAddLink()
                },
                {
                    actionTitle: "Add subgroup",
                    dangerous: false,
                    onClick: () => this.VIEW_MODEL.addSubGroup(
                        prompt("Give subgroup title"), prompt("Give subgroup description"))
                },
                {
                    actionTitle: "Edit Group title",
                    dangerous: false,
                    onClick: () => this.toggleGroupTitleEditable(event?.target as HTMLElement)
                },
                {
                    actionTitle: "Manage links",
                    dangerous: false,
                    onClick: () => this.toggleLinksManagementOptions(event?.target as HTMLElement)
                },
                {
                    actionTitle: "Delete group",
                    dangerous: true,
                    dangerConfirmation: "All links and sub-groups associated to that group will be deleted.",
                    onClick: () => this.VIEW_MODEL.deleteGroup(this.id)
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
            onClick => this.actionAddLink()
        ));

        // group body elements
        // links
        this.VIEW_MODEL.observables.group
            .subscribe((attrs: GroupDTO) => {
                this.renderGroupHead(titleSectionElem, attrs);
                this.renderGroupItems(bodyElem, attrs);
            });
    }

    attachListeners() {
        // listeners are re-attached reactively inside renderGroupHead on each observable emission
    }

    private renderGroupItems(parentElem: HTMLElement, groupDto: GroupDTO): void {
        // handleReactiveRendering<GroupItemDTO, HTMLButtonElement>(
        //     parentElem,
        //     groupDto.items,
        //     groupItem => groupItem.id,
        //     groupItem => {
        //         switch (groupItem.type) {
        //             case "link":
        //                 return this.renderLink(groupItem);
        //             case "subgroup":
        //                 return this.renderSubgroup(groupItem);
        //             default:
        //                 console.error("unsupported element");
        //                 return document.createElement("span");
        //         }
        //     }
        // );
        if (!groupDto.items) {
            return;
        }
        //TODO pre hybanie linkami vymysliet destruktivnu akciu na prerenderovanie vsetkeho v
        // ramci grupy, resp. vymysliet ako predat flag na trigger destruktivnej akcie
        parentElem.replaceChildren();
        groupDto.items.forEach(groupItem => {
            switch (groupItem.type) {
                case "link":
                    parentElem.appendChild(this.renderLink(groupItem as LinkDTO));
                    break;
                case "subgroup":
                    parentElem.appendChild(this.renderSubgroup(groupItem as SubgroupDTO));
                    break;
                default:
                    console.error("unsupported element");
                    //return document.createElement("span");
            }
        });
    }

    private actionAddLink() {
        this.LOG.debug(
            "render",
            "add link to group: " + this.title + " with id: " + this.id + " clicked");
        this.VIEW_MODEL.addLink(prompt("Give URL"), prompt("Give name"), this.id);
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

    /**
     * Re-renders the title/description inside the group header and re-attaches blur listeners.
     * Called on every group observable emission — mirrors the pattern in workspaceComponent.
     * Because replaceChildren discards the old elements (including any contentEditable state),
     * clicking outside while editing triggers blur → save → observable → fresh elements → edit mode cleared.
     */
    private renderGroupHead(titleSectionElem: HTMLElement, groupDto: GroupDTO): void {
        titleSectionElem.replaceChildren(
            renderTextContainer("h2", groupDto.title),
            renderTextContainer("span", groupDto.description)
        );
        this.listenerChangeGroupName();
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

    private toggleLinksManagementOptions(menuItem: HTMLElement) {
        this.getElementsByTagName(ELEM_GROUP_BODY)[0].classList.toggle("managed");
        if (this.getElementsByTagName(ELEM_GROUP_BODY)[0].classList.contains("managed")) {
            setTimeout(() => { menuItem.textContent = "Finish group links editing" }, 250);
        } else {
            setTimeout(() => { menuItem.textContent = "Manage links" }, 250);
        }
    }

    private listenerChangeGroupName() {
        const titleAndDescParentContainer = this.getElementsByClassName(CLASS_GROUP_HEAD_TITLE)[0];
        const titleElem = titleAndDescParentContainer.querySelector<HTMLElement>(":scope > h2")!;
        const descriptionElem = titleAndDescParentContainer.querySelector<HTMLElement>(":scope > span")!;

        const save = () =>
            this.VIEW_MODEL.editGroupTitle(this.id, titleElem.textContent, descriptionElem.textContent);

        titleElem.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') e.preventDefault(); // prevent new lines in title
        });

        // Use focusout (bubbles) so we can check relatedTarget — skip save when focus
        // just moved to the description field within the same edit session.
        titleElem.addEventListener('focusout', (e: FocusEvent) => {
            if (e.relatedTarget === descriptionElem) return;
            save();
        });

        descriptionElem.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') e.preventDefault();
        });

        descriptionElem.addEventListener('blur', save);
    }

}
