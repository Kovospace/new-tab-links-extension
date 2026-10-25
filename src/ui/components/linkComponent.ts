
// data / model layer
import { LinkDTO } from "../../viewModel/abstract/dtos"
import { LinkViewModel } from "../../viewModel/linkViewModel";

// components layer
import { AbstractComponent } from "../abstract/abstractComponent"
import { ICON, renderContainer, renderButton } from "../partials/wrappedHtmlElements"
import {
    ACT_LINK_DELETE, ACT_LINK_EDIT, ACT_LINK_MOVE_UP, ACT_LINK_MOVE_DOWN,
    CLASS_LINK_ACTIONS_CONTAINER, CLASS_LINK_TEXT, CLASS_LINK_ICON, CLASS_ACTION_ADD,
    CLASS_ACTION_DANGER, CLASS_LINK_WRAPPER
} from "../../constants";

// utils
import {FaviconsHandler} from "../backgroundWorkerCommands/faviconsHandler";
import { contextMenu, ContextMenuAction } from "../partials/contextMenu";
import {InputDialog} from "../partials/inputDialog";
import {
    makeDraggable, makeReorderTarget, whatIsBeingDragged
} from "../dragAndDrop/dragAndDrop";
import { t } from "../../i18n/i18n";

export class LinkComponent extends AbstractComponent<LinkDTO, LinkViewModel> {

    private editLinkDialog: InputDialog = new InputDialog(
        t("link.editDialog.title"),
        {
            [t("dialogs.fields.title")]: { type: "string", key: "title" },
            [t("dialogs.fields.url")]: { type: "url", key: "url" }
        },
        ({ title, url }) => this.VIEW_MODEL.editLink(title, url));

    protected render(parentElem: HTMLElement) {

        this.VIEW_MODEL.observables.link
            .subscribe((linkDto: LinkDTO)=> {
                parentElem.replaceChildren();
                this.renderLink(linkDto, parentElem);
            });
    }

    protected attachListeners(_parentElem: HTMLElement) {
        this.listenerOpenLink();
        this.listenerDragAndDrop();
        this.listenerContextMenu();
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
        const wrapper: HTMLElement = renderContainer([CLASS_LINK_WRAPPER]);
        parentElem.appendChild(wrapper);

        const faviconDiv: HTMLElement = renderContainer([CLASS_LINK_ICON]);
        wrapper.appendChild(faviconDiv);

        const linkContentDiv: HTMLElement = renderContainer([CLASS_LINK_TEXT]);
        wrapper.appendChild(linkContentDiv);

        const linkActionsDiv: HTMLElement = renderContainer([CLASS_LINK_ACTIONS_CONTAINER]);
        wrapper.appendChild(linkActionsDiv);

        // link
        const anchor: HTMLAnchorElement = document.createElement("a");
        anchor.href = linkDto.url;
        anchor.textContent = linkDto.title;
        // An anchor drags itself by default - as a URL, out of the page - and an image does
        // the same. Both are inside the thing being dragged, so pressing on the name or the
        // icon started their drag instead of this link's, and the link could only be picked
        // up by the bare strip around them.
        anchor.draggable = false;
        linkContentDiv.appendChild(anchor);

        // description
        // const span: HTMLSpanElement = document.createElement("span");
        // span.textContent = linkDto.description ? linkDto.description : "";
        // linkContentDiv.appendChild(span);

        // icon — worker resolves to a base64 data URI or a fallback asset path
        const img: HTMLImageElement = document.createElement("img");
        img.width = 32;
        img.height = 32;
        img.src = '/gfx/favicon-default.svg';
        img.draggable = false;

        FaviconsHandler
            .handleIconDownloadAndCache(anchor.href)
            .then(iconSrc => { if (iconSrc) img.src = iconSrc; });

        faviconDiv.appendChild(img);

        // "manage links" actions
        linkActionsDiv.appendChild(renderButton(
            ICON.MOVE_UP, this.DTO.id, [ACT_LINK_MOVE_UP], t("link.moveUp"), onClick => {
                event?.stopPropagation();
                this.VIEW_MODEL.moveLinkUp();
            }));

        linkActionsDiv.appendChild(renderButton(
            ICON.MOVE_DOWN, this.DTO.id, [ACT_LINK_MOVE_DOWN], t("link.moveDown"), onClick => {
                event?.stopPropagation();
                this.VIEW_MODEL.moveLinkDown();
            }));

        linkActionsDiv.appendChild(renderButton(
            ICON.DELETE, this.DTO.id, [ACT_LINK_DELETE, CLASS_ACTION_DANGER], t("link.delete"), onClick => {
                event?.stopPropagation();
                this.VIEW_MODEL.deleteLink();
            }));

        linkActionsDiv.appendChild(renderButton(
            ICON.EDIT, this.DTO.id, [ACT_LINK_EDIT], t("link.edit"), onClick => {
                event?.stopPropagation();
                this.editLinkDialog.show({ title: this.DTO.title, url: this.DTO.url });
            }));
    }

    /**
     *  Makes this link draggable, and a place another link can be dropped beside.
     *
     *  Dropping onto a link means "where this one is": its group, its subgroup, and its place
     *  in the sequence - which is how a link crosses from one group to another, or into a
     *  subgroup, without any of that being said separately.
     */
    private listenerDragAndDrop() {
        makeDraggable(this, { kind: "link", id: this.DTO.id });
        makeReorderTarget(this, ["link", "subgroup", "panelTab"], (side, draggedId) => {
            const index = this.VIEW_MODEL.indexInScope() + (side === "after" ? 1 : 0);
            const carrying = whatIsBeingDragged();

            // A root-level link shares its sequence with the group's subgroups, so a subgroup
            // can be dropped beside it. One inside a subgroup does not, and says so itself.
            if (carrying?.kind === "subgroup") {
                this.VIEW_MODEL.acceptSubgroup(draggedId, index);
                return;
            }
            // A closed tab is not a link anywhere yet; dropping one makes it one, here.
            if (carrying?.kind === "panelTab") {
                this.VIEW_MODEL.acceptClosedTab(carrying.url, carrying.title, index);
                return;
            }
            this.VIEW_MODEL.acceptLink(draggedId, index);
        });
    }

    private listenerOpenLink() {
        this.addEventListener('click', () => {
            window.location.href = this.DTO.url;
        });
    }

    private listenerContextMenu() {
        this.addEventListener('contextmenu', (e: Event) => {
            const img = this.querySelector<HTMLImageElement>('img');
            if (!img) return;

            e.preventDefault();

            const anchor = this.querySelector<HTMLAnchorElement>('a');
            const url = anchor?.href ?? this.DTO.url;

            // link actions
            const actions: ContextMenuAction[] = [
                {
                    label: t("link.menu.copyUrl"),
                    onClick: () => navigator.clipboard.writeText(this.DTO.url)
                },
                {
                    label: t("link.menu.edit"),
                    onClick: () => this.editLinkDialog.show({ title: this.DTO.title, url: this.DTO.url })
                },
                {
                    label: t("link.menu.refreshIcon"),
                    onClick: async () => {
                        const newSrc = await FaviconsHandler.refreshIcon(url);
                        if (newSrc && img.isConnected) img.src = newSrc;
                    }
                }
            ];

            // reordering, next to the other ways of moving a link and before them: this is
            // the one that does not change what the link belongs to. Each is offered only
            // when there is somewhere to go - see canMove.
            const movable = this.VIEW_MODEL.canMove();
            if (movable.up) {
                actions.push({
                    label: `${ICON.MOVE_UP} ${t("link.menu.moveUp")}`,
                    onClick: () => this.VIEW_MODEL.moveLinkUp()
                });
            }
            if (movable.down) {
                actions.push({
                    label: `${ICON.MOVE_DOWN} ${t("link.menu.moveDown")}`,
                    onClick: () => this.VIEW_MODEL.moveLinkDown()
                });
            }

            // move to / from subgroup link actions
            if (this.DTO.subGroupId) {
                actions.push({
                    label: t("link.menu.moveOutOfSubgroup"),
                    onClick: () => this.VIEW_MODEL.moveLinkOutOfSubgroup()
                });
            } else {
                const subgroups = this.VIEW_MODEL.getSubgroupsForGroup();
                subgroups.forEach(sg => {
                    actions.push({
                        label: t("link.menu.moveToSubgroup", { name: sg.title }),
                        onClick: () => this.VIEW_MODEL.moveLinkToSubgroup(sg.id)
                    });
                });
            }

            // delete link action
            actions.push({
                label: t("link.menu.delete"),
                danger: true,
                onClick: () => {
                    this.VIEW_MODEL.deleteLink();
                }
            });

            contextMenu.show((e as MouseEvent).clientX, (e as MouseEvent).clientY, actions);
        });
    }

}