
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
    CLASS_SUBGROUP_LINK_COUNT,
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
import {InputDialog} from "../partials/inputDialog";
import { MAX_TITLE_LENGTH, MAX_URL_LENGTH } from "../../backend/sync/SyncContracts";
import { ColorPickerDialog } from "../partials/colorPickerDialog";
import { swatchOf } from "../../backend/entity/TabGroupColors";



export class SubgroupComponent extends AbstractComponent<SubgroupDTO, SubGroupViewModel> {

    private subgroupTitleEditingMenuItem: HTMLElement | null = null;

    private addLinkDialog: InputDialog = new InputDialog(
        "Add link",
        {
            "Link title": { type: "string", required: true, maxLength: MAX_TITLE_LENGTH },
            "URL": { type: "url", required: true, maxLength: MAX_URL_LENGTH }
        },
        ({ linkTitle, url }) => this.VIEW_MODEL.addLink(linkTitle, url));

    protected render(parentElem: HTMLElement) {
        this.VIEW_MODEL.observables.subgroup
            .subscribe((subGroup: SubgroupDTO) => this.renderSubGroup(parentElem, subGroup));
    }

    protected attachListeners(parentElem: HTMLElement) {
        this.listenerOnHeadClick(parentElem);
        this.listenerChangeSubgroupTitle();
    }

    private renderSubGroup(parentElem: HTMLElement, subgroupDto: SubgroupDTO) {

        // The subgroup's colour, handed to the stylesheet rather than applied here: the
        // heading, and anything else that comes to want it, then reads one custom property.
        this.style.setProperty("--subgroup-color", swatchOf(subgroupDto.color).hex);

        const headElem: HTMLElement = document.createElement(ELEM_SUBGROUP_HEAD);
        this.appendChild(headElem);

        const bodyElem: HTMLElement = document.createElement(ELEM_SUBGROUP_BODY);
        if (subgroupDto.collapsed) bodyElem.classList.add("rolled");
        this.appendChild(bodyElem);

        // Subgroup head
        // subgroup heading texts
        const subgroupInfoContainer: HTMLElement = renderContainer([CLASS_SUBGROUP_HEAD_TITLE]);
        headElem.appendChild(subgroupInfoContainer);
        const subgroupTitle = renderTextContainer("h3", this.DTO.title);
        const subgroupDescription = renderTextContainer("span", this.DTO.description);
        const count = subgroupDto.links?.length ?? 0;
        const linkCount = renderTextContainer(
            "span", count === 0 ? "No items in subgroup yet" : `${count} hidden items`);
        linkCount.classList.add(CLASS_SUBGROUP_LINK_COUNT);
        if (count === 0) linkCount.classList.add("empty");
        subgroupInfoContainer.appendChild(subgroupTitle);
        subgroupInfoContainer.appendChild(subgroupDescription);
        subgroupInfoContainer.appendChild(linkCount);

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

        // subgroup actions
        const subgroupActionsContainer: HTMLElement = renderContainer([CLASS_SUBGROUP_HEAD_ACTIONS]);
        headElem.appendChild(subgroupActionsContainer);

        // subgroup actions - open menu button
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
                    onClick: () => {
                        event?.stopPropagation();
                        this.addLinkDialog.show();
                    }
                },
                {
                    actionTitle: "Expand / Collapse group",
                    onClick: () => this.actionSubgroupFold()
                },
                {
                    actionTitle: "Open all links in grouped tabs",
                    onClick: () => {
                        this.actionOpenSubGroupLinks();
                    }
                },
                {
                    actionTitle: "Open all links in separated tabs",
                    onClick: () => {
                        this.actionOpenSubGroupLinksIsolated();
                    }
                },
                {
                    actionTitle: "Catch links into tab group",
                    checkable: true,
                    active: subgroupDto.catchLinksIntoTabGroup,
                    onClick: () => this.VIEW_MODEL.toggleCatchLinksIntoTabGroup()
                },
                {
                    actionTitle: "Grouped tabs color",
                    swatchColor: swatchOf(subgroupDto.color).hex,
                    onClick: () => void this.actionPickColor(subgroupDto)
                },
                {
                    actionTitle: "Edit subgroup title & description",
                    onClick: () => this.toggleSubgroupTitleEditable(event?.target as HTMLElement)
                },
                {
                    actionTitle: "Manage links",
                    onClick: () => this.toggleLinksManagementOptions(event?.target as HTMLElement)
                },
                {
                    actionTitle: "Move all links out of subgroup",
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

        // subgroup actions - open all subgroup links in new tabs button
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

        // subgroup body
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
            .addEventListener('click', () => {
                const titleContainer = this.getElementsByClassName(CLASS_SUBGROUP_HEAD_TITLE)[0];
                const titleElem = titleContainer?.querySelector<HTMLElement>(":scope > h3");
                const descElem = titleContainer?.querySelector<HTMLElement>(":scope > span");
                if (titleElem?.isContentEditable || descElem?.isContentEditable) return;
                this.actionSubgroupFold();
            });
    }

    private actionSubgroupFold(): void {
        const body = this.getElementsByTagName(ELEM_SUBGROUP_BODY)[0];
        if (!body) return;
        body.classList.toggle("rolled");
        this.VIEW_MODEL.toggleCollapsed();
    }

    private actionOpenSubGroupLinks(): void {
        if (!this.DTO.links) {
            return;
        }
        OpenSubgroupAsGroupedTabsHandler.handleGroupedTabsOpen(
            this.DTO.links.map(link => link.url), this.DTO.title, this.DTO.color);
    }

    /**
     *  Asks which colour this subgroup's tab group should be, and applies the answer.
     *
     *  A group already open in the tab strip is repainted too, in every window it is open in.
     *  Storing the colour and leaving the visible group as it was would look like the picker
     *  had not worked.
     */
    private async actionPickColor(subgroupDto: SubgroupDTO): Promise<void> {
        const chosen = await new ColorPickerDialog(subgroupDto.title, subgroupDto.color).ask();
        if (!chosen) {
            return;
        }
        this.VIEW_MODEL.setColor(chosen);
        await OpenSubgroupAsGroupedTabsHandler.handleGroupRecolor(subgroupDto.title, chosen);
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
            this.subgroupTitleEditingMenuItem = menuItem;
            setTimeout(() => { menuItem.textContent = "Save subgroup title" }, 250);
            (titleElem as HTMLElement).focus();
        } else {
            this.subgroupTitleEditingMenuItem = null;
            setTimeout(() => { menuItem.textContent = menuItem.getAttribute('defaultText') }, 250);
        }
    }

    private exitSubgroupTitleEditing(): void {
        const container = this.getElementsByClassName(CLASS_SUBGROUP_HEAD_TITLE)[0];
        const titleElem = container?.querySelector<HTMLElement>(":scope > h3");
        const descElem = container?.querySelector<HTMLElement>(":scope > span");
        titleElem?.removeAttribute('contentEditable');
        titleElem?.classList.remove('editable');
        descElem?.removeAttribute('contentEditable');
        descElem?.classList.remove('editable');
        if (this.subgroupTitleEditingMenuItem) {
            this.subgroupTitleEditingMenuItem.classList.remove('active');
            this.subgroupTitleEditingMenuItem.textContent =
                this.subgroupTitleEditingMenuItem.getAttribute('defaultText');
            this.subgroupTitleEditingMenuItem = null;
        }
    }

    private listenerChangeSubgroupTitle(): void {
        const container = this.getElementsByClassName(CLASS_SUBGROUP_HEAD_TITLE)[0] as HTMLElement;
        const titleElem = container.querySelector<HTMLElement>(":scope > h3")!;
        const descriptionElem = container.querySelector<HTMLElement>(":scope > span")!;

        titleElem.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') e.preventDefault();
        });

        descriptionElem.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') e.preventDefault();
        });

        // focusout bubbles from any child — only save when focus leaves the container entirely
        container.addEventListener('focusout', (e: FocusEvent) => {
            if (container.contains(e.relatedTarget as Node)) return;
            this.VIEW_MODEL.editSubgroupTitle(this.id, titleElem.textContent ?? "", descriptionElem.textContent ?? "");
            this.exitSubgroupTitleEditing();
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