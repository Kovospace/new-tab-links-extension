
// data / model layer
import { LinkDTO } from "../../viewModel/abstract/dtos"
import { LinkViewModel } from "../../viewModel/linkViewModel";

// components layer
import { AbstractComponent } from "../abstract/abstractComponent"
import { ICON, renderContainer, renderButton } from "../partials/wrappedHtmlElements"
import { ACT_LINK_DELETE, ACT_LINK_EDIT, ACT_LINK_MOVE_UP, ACT_LINK_MOVE_DOWN,
    CLASS_LINK_ACTIONS_CONTAINER, CLASS_LINK_TEXT, CLASS_LINK_ICON, CLASS_ACTION_ADD,
    CLASS_ACTION_DANGER } from "../../constants";

// utils
import {FaviconsHandler} from "../backgroundWorkerCommands/faviconsHandler";
import { contextMenu, ContextMenuAction } from "../partials/contextMenu";
import {InputDialog} from "../partials/inputDialog";
import { makeDraggable, makeReorderTarget } from "../dragAndDrop/dragAndDrop";

export class LinkComponent extends AbstractComponent<LinkDTO, LinkViewModel> {

    private editLinkDialog: InputDialog = new InputDialog(
        "Edit link",
        { "Title": "string", "URL": "url" },
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
        const faviconDiv: HTMLElement = renderContainer([CLASS_LINK_ICON]);
        parentElem.appendChild(faviconDiv);

        const linkContentDiv: HTMLElement = renderContainer([CLASS_LINK_TEXT]);
        parentElem.appendChild(linkContentDiv);

        const linkActionsDiv: HTMLElement = renderContainer([CLASS_LINK_ACTIONS_CONTAINER]);
        parentElem.appendChild(linkActionsDiv);

        // link
        const anchor: HTMLAnchorElement = document.createElement("a");
        anchor.href = linkDto.url;
        anchor.textContent = linkDto.title;
        linkContentDiv.appendChild(anchor);

        // description
        const span: HTMLSpanElement = document.createElement("span");
        span.textContent = linkDto.description ? linkDto.description : "";
        linkContentDiv.appendChild(span);

        // icon — worker resolves to a base64 data URI or a fallback asset path
        const img: HTMLImageElement = document.createElement("img");
        img.width = 32;
        img.height = 32;
        img.src = '/gfx/favicon-default.svg';

        FaviconsHandler
            .handleIconDownloadAndCache(anchor.href)
            .then(iconSrc => { if (iconSrc) img.src = iconSrc; });

        faviconDiv.appendChild(img);

        // "manage links" actions
        linkActionsDiv.appendChild(renderButton(
            ICON.MOVE_UP, this.DTO.id, [ACT_LINK_MOVE_UP], "Move link up", onClick => {
                event?.stopPropagation();
                this.VIEW_MODEL.moveLinkUp();
            }));

        linkActionsDiv.appendChild(renderButton(
            ICON.MOVE_DOWN, this.DTO.id, [ACT_LINK_MOVE_DOWN], "Move link down", onClick => {
                event?.stopPropagation();
                this.VIEW_MODEL.moveLinkDown();
            }));

        linkActionsDiv.appendChild(renderButton(
            ICON.DELETE, this.DTO.id, [ACT_LINK_DELETE, CLASS_ACTION_DANGER], "Delete link", onClick => {
                event?.stopPropagation();
                this.VIEW_MODEL.deleteLink();
            }));

        linkActionsDiv.appendChild(renderButton(
            ICON.EDIT, this.DTO.id, [ACT_LINK_EDIT], "Edit link", onClick => {
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
        makeReorderTarget(this, "link", (side, draggedId) => {
            const index = this.VIEW_MODEL.indexInScope() + (side === "after" ? 1 : 0);
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
                    label: 'Copy link URL',
                    onClick: () => navigator.clipboard.writeText(this.DTO.url)
                },
                {
                    label: 'Edit link',
                    onClick: () => this.editLinkDialog.show({ title: this.DTO.title, url: this.DTO.url })
                },
                {
                    label: 'Refresh icon',
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
                    label: `${ICON.MOVE_UP} Move up`,
                    onClick: () => this.VIEW_MODEL.moveLinkUp()
                });
            }
            if (movable.down) {
                actions.push({
                    label: `${ICON.MOVE_DOWN} Move down`,
                    onClick: () => this.VIEW_MODEL.moveLinkDown()
                });
            }

            // move to / from subgroup link actions
            if (this.DTO.subGroupId) {
                actions.push({
                    label: 'Move out of subgroup',
                    onClick: () => this.VIEW_MODEL.moveLinkOutOfSubgroup()
                });
            } else {
                const subgroups = this.VIEW_MODEL.getSubgroupsForGroup();
                subgroups.forEach(sg => {
                    actions.push({
                        label: `Move to "${sg.title}"`,
                        onClick: () => this.VIEW_MODEL.moveLinkToSubgroup(sg.id)
                    });
                });
            }

            // delete link action
            actions.push({
                label: 'Delete link',
                danger: true,
                onClick: () => {
                    this.VIEW_MODEL.deleteLink();
                }
            });

            contextMenu.show((e as MouseEvent).clientX, (e as MouseEvent).clientY, actions);
        });
    }

}