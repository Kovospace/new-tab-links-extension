
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
} from "../../constants"

// utils

// data / model layer
import { GroupViewModel } from "../../viewModel/groupViewModel";
import { LinkViewModel } from "../../viewModel/linkViewModel";
import { SubGroupViewModel } from "../../viewModel/subGroupViewModel";
import { GroupDTO, GroupItemDTO, LinkDTO, SubgroupDTO, WorkspaceDTO } from "../../viewModel/abstract/dtos"

// components layer
import { AbstractComponent } from "../abstract/abstractComponent"
import { LinkComponent } from "./linkComponent"
import { SubgroupComponent } from "./subgroupComponent"
import { ICON, renderContainer, renderButton, renderTextContainer } from "../../ui/partials/wrappedHtmlElements"
import {OptionsMenu} from "../partials/optionsMenu";
import { toggleManageLinksMode } from "../partials/manageLinksMode";
import {InputDialog} from "../partials/inputDialog";
import {SelectDialog} from "../partials/selectDialog";
import { showNotice } from "../partials/confirmations";
import { MAX_DESCRIPTION_LENGTH, MAX_NAME_LENGTH, MAX_TITLE_LENGTH, MAX_URL_LENGTH } from "../../backend/sync/SyncContracts";
import {
    makeContainerTarget, makeDraggable, makeReorderTarget, whatIsBeingDragged
} from "../dragAndDrop/dragAndDrop";
import { t } from "../../i18n/i18n";



export class GroupComponent extends AbstractComponent<GroupDTO, GroupViewModel> {

    private groupTitleEditingMenuItem: HTMLElement | null = null;

    private addSubgroupDialog: InputDialog = new InputDialog(
        t("group.addSubgroupDialog.title"),
        {
            [t("group.addSubgroupDialog.name")]:
                { type: "string", required: true, maxLength: MAX_NAME_LENGTH,
                  key: "subgroupTitle" },
            [t("group.addSubgroupDialog.description")]:
                { type: "string", maxLength: MAX_DESCRIPTION_LENGTH, key: "subgroupDescription" }
        },
        ({ subgroupTitle, subgroupDescription }) => this.VIEW_MODEL.addSubGroup(subgroupTitle, subgroupDescription));

    private addLinkDialog: InputDialog = new InputDialog(
        t("group.addLinkDialog.title"),
        {
            [t("dialogs.fields.name")]:
                { type: "string", required: true, maxLength: MAX_TITLE_LENGTH, key: "name" },
            [t("dialogs.fields.url")]:
                { type: "url", required: true, maxLength: MAX_URL_LENGTH, key: "url" }
        },
        ({ url, name }) => this.VIEW_MODEL.addLink(url, name, this.id));

    render(parentElem: HTMLElement): void {

        // group container elements
        const headerElem: HTMLElement = document.createElement(ELEM_GROUP_HEAD);
        const bodyElem: HTMLElement = document.createElement(ELEM_GROUP_BODY);
        const footerElem: HTMLElement = document.createElement(ELEM_GROUP_FOOT);
        parentElem.appendChild(headerElem);
        parentElem.appendChild(bodyElem);

        // The head is a target of its own, not merely a piece of the group that a drop
        // bubbles out of. Bubbling does work - a drop on the title reaches the group - but
        // the head is where somebody aims when they mean "this group", and a target that is
        // the thing being aimed at can say so: it highlights, and it cannot be broken by
        // anything inside it that stops an event on its way out.
        makeContainerTarget(headerElem, ["link", "subgroup", "panelTab"],
            draggedId => this.takeDropped(draggedId));
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
                openMenuButtonTooltipText: t("group.menu.tooltip")
            },
            [
                {
                    actionTitle: t("group.menu.addLink"),
                    onClick: () => this.actionAddLink()
                },
                {
                    actionTitle: t("group.menu.addSubgroup"),
                    onClick: () => this.addSubgroupDialog.show()
                },
                {
                    actionTitle: t("group.menu.editTitle"),
                    onClick: () => this.toggleGroupTitleEditable(event?.target as HTMLElement)
                },
                {
                    actionTitle: t("group.menu.manageLinks"),
                    onClick: () => this.toggleLinksManagementOptions(event?.target as HTMLElement)
                },
                {
                    actionTitle: t("group.menu.moveLeft"),
                    onClick: () => this.VIEW_MODEL.moveGroupUp()
                },
                {
                    actionTitle: t("group.menu.moveRight"),
                    onClick: () => this.VIEW_MODEL.moveGroupDown()
                },
                {
                    actionTitle: t("group.menu.migrate"),
                    onClick: () => void this.actionMigrateToWorkspace()
                },
                {
                    actionTitle: t("group.menu.delete"),
                    dangerous: true,
                    dangerConfirmation: t("group.menu.deleteConfirmation"),
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
            t("group.addLinkTooltip"),
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
        this.listenerDragAndDrop();
    }

    /**
     *  Makes this group draggable among its siblings, and a place a link can be dropped.
     *
     *  Two kinds of drop land here and they mean different things. A group dropped on a group
     *  is a reorder, decided left or right rather than up or down because these are columns.
     *  A link dropped on the group - on its body, not on one of its links - means "this group,
     *  at the end", which is what dropping on empty space below the list should do.
     */
    private listenerDragAndDrop() {
        makeDraggable(this, { kind: "group", id: this.DTO.id });
        makeReorderTarget(this, "group", (side, draggedId) => {
            const index = this.VIEW_MODEL.indexAmongGroups() + (side === "after" ? 1 : 0);
            this.VIEW_MODEL.acceptGroup(draggedId, index);
        });
        makeContainerTarget(this, ["link", "subgroup", "panelTab"],
            draggedId => this.takeDropped(draggedId));
    }

    /**
     *  Takes whatever was dropped into this group, at the end of it.
     *
     *  A link or a subgroup moves here, carrying what belongs to it; a closed tab is made into
     *  a link. All three mean the same thing to a group: this belongs here now.
     */
    private takeDropped(draggedId: string): void {
        const carrying = whatIsBeingDragged();
        if (carrying?.kind === "subgroup") {
            this.VIEW_MODEL.takeSubgroup(draggedId);
            return;
        }
        if (carrying?.kind === "panelTab") {
            this.VIEW_MODEL.takeClosedTab(carrying.url, carrying.title);
            return;
        }
        this.VIEW_MODEL.takeLink(draggedId);
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
        this.addLinkDialog.show();
    }

    /**
     * Asks which workspace this group should move into, and moves it there.
     *
     * The dialog is built here rather than kept as a field like the others, because its
     * options are the profile's workspaces as they stand at the moment it is opened - one
     * built at construction time would still be offering a workspace that has since been
     * renamed or deleted.
     */
    private async actionMigrateToWorkspace(): Promise<void> {
        const workspaces: WorkspaceDTO[] = this.VIEW_MODEL.getWorkspacesToMigrateInto();
        if (workspaces.length === 0) {
            // Worth saying: a menu item that does nothing when clicked reads as a broken one,
            // and the reason it did nothing is not visible anywhere on the screen.
            await showNotice(t("group.migrateDialog.title"), t("group.migrateDialog.nowhereToGo"));
            return;
        }
        const chosenWorkspaceId: string | null = await new SelectDialog<string>(
            t("group.migrateDialog.title"),
            t("group.migrateDialog.field"),
            workspaces.map(workspace => ({ label: workspace.title, value: workspace.id })),
            t("group.migrateDialog.confirm")
        ).ask();
        this.VIEW_MODEL.migrateToWorkspace(chosenWorkspaceId);
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
            this.groupTitleEditingMenuItem = menuItem;
            setTimeout(() => { menuItem.textContent = t("group.menu.saveTitle") }, 250);
            (titleElem as HTMLElement).focus();
        } else {
            this.groupTitleEditingMenuItem = null;
            setTimeout(() => { menuItem.textContent = menuItem.getAttribute('defaultText') }, 250);
        }
    }

    private exitGroupTitleEditing() {
        const container = this.getElementsByClassName(CLASS_GROUP_HEAD_TITLE)[0];
        const titleElem = container?.querySelector<HTMLElement>(":scope > h2");
        const descElem = container?.querySelector<HTMLElement>(":scope > span");
        titleElem?.removeAttribute('contentEditable');
        titleElem?.classList.remove('editable');
        descElem?.removeAttribute('contentEditable');
        descElem?.classList.remove('editable');
        if (this.groupTitleEditingMenuItem) {
            this.groupTitleEditingMenuItem.classList.remove('active');
            this.groupTitleEditingMenuItem.textContent =
                this.groupTitleEditingMenuItem.getAttribute('defaultText');
            this.groupTitleEditingMenuItem = null;
        }
    }

    private toggleLinksManagementOptions(menuItem: HTMLElement) {
        toggleManageLinksMode(this.getElementsByTagName(ELEM_GROUP_BODY)[0], menuItem,
            { manage: t("group.menu.manageLinks"), finish: t("group.menu.finishManagingLinks") });
    }

    private listenerChangeGroupName() {
        const container = this.getElementsByClassName(CLASS_GROUP_HEAD_TITLE)[0] as HTMLElement;
        const titleElem = container.querySelector<HTMLElement>(":scope > h2")!;
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
            this.VIEW_MODEL.editGroupTitle(this.id, titleElem.textContent, descriptionElem.textContent);
            this.exitGroupTitleEditing();
        });
    }

}
