import {AppStateRepository} from "../../backend/repository/AppStateRepository";
import {GroupViewModel} from "../../viewModel/groupViewModel";
import {GroupDTO, GroupItemDTO, LinkDTO, SubgroupDTO, GroupItemsDTO} from "../../viewModel/groupViewModelInterfaces";
import {qsAll} from "../../utils/firstOrderMethods";
import {LinkComponent} from "./linkComponent"
import {
    ELEM_LINK,
    ELEM_SUBGROUP,
    ELEM_GROUP_HEAD,
    ELEM_GROUP_FOOT,
    ELEM_GROUP_BODY,
    ACT_SWITCH_WORKSPACE,
    ACT_ADD_LINK,
    ACT_ADD_GROUP
} from "../../main"
import {renderButton, renderH1, renderContainer, ICON, renderSpan} from "../../utils/elementsRendering"
import {Logger} from "../../utils/logger";

export class GroupComponent extends HTMLElement {

    private log: Logger = new Logger("GroupComponent");

    private groupViewModel!: GroupViewModel;
    private appStateRepository!: AppStateRepository;

    setRepository(repo: AppStateRepository) {
        this.appStateRepository = repo;
        this.tryInit();
    }

    connectedCallback() {
        this.tryInit();
    }

    private tryInit() {
        if (!this.isConnected || !this.appStateRepository || !this.id) return;
        // console.log("inited");
        this.groupViewModel = new GroupViewModel(this.appStateRepository, this.id, this.title);
        this.render();
        this.callbacks();
        this.listeners()
    }

    private render(): void {
        this.groupViewModel.groupItemsObservable
            .subscribe((attrs: GroupDTO) => this.renderHtmlTemplate(attrs));
    }

    private listeners(): void {
        this.onAddLinkButtonClick();
    }

    private callbacks(): void {
       this.bindComponentClassToLinkElements();
    }

    /**
     * Parent to inflate:
     *
     *  <link-group id="[[ this.id ]]"></link-group>
     *
     * Rendered content:
     *
     *  <link-group-head></link-group-head>
     *  <link-group-body>
     *    <link-container id="[[ LinkDTO.id ]]"></link-container>
     *    <link-subgroup id="[[ SubgroupDTO.id ]]">
     *      <link-container id="[[ LinkDTO.id ]]"></link-container>
     *    </link-subgroup>
     *  </link-group-body>
     *  <link-group-foot>
     *    <button class="[[ ACT_ADD_LINK ]]" title="[[ GroupDTO.title ]]" value="[[ GroupDTO.id ]]">
     *      [[ GroupDTO.title ]]
     *    </button>
     *  </link-group-foot>
     */
    private renderHtmlTemplate(groupDto: GroupDTO): void {
        const parentElem: HTMLElement | null = document.getElementById(this.id);

        const headerElem: HTMLElement = document.createElement(ELEM_GROUP_HEAD);
        const separatorElem: HTMLElement = document.createElement("hr");
        const bodyElem: HTMLElement = document.createElement(ELEM_GROUP_BODY);
        const footerElem: HTMLElement = document.createElement(ELEM_GROUP_FOOT);
        parentElem.appendChild(headerElem);
        parentElem.appendChild(separatorElem);
        parentElem.appendChild(bodyElem);
        parentElem.appendChild(footerElem);

        const titleSectionElem: HTMLElement = renderContainer(["group-head-title"]);
        const actionsSectionElem: HTMLElement = renderContainer(["group-head-actions"]);
        headerElem.appendChild(titleSectionElem);
        headerElem.appendChild(actionsSectionElem);

        // group head
        const titleElem: HTMLHeadingElement = document.createElement("h2");
        titleElem.title = groupDto.title;
        titleElem.textContent = groupDto.title
        titleSectionElem.appendChild(titleElem);

        titleSectionElem.appendChild(renderSpan("TODO description pre každú grupu"));

        // group body with links and subgroups
        groupDto.groupItems.forEach((groupItem: GroupItemDTO) => {
            switch (groupItem.type) {
                case "link":
                    this.renderLink(groupItem, bodyElem);
                    break;
                case "subgroup":
                    this.renderSubgroup(groupItem, bodyElem);
                    break;
                default:
                    console.error("Unknown group item type:", groupItem.type);
            }
        });


        const addButtonElem: HTMLButtonElement = document.createElement("button");
        addButtonElem.title = "Add link";
        addButtonElem.className = ACT_ADD_LINK;
        addButtonElem.value = groupDto.groupId;
        addButtonElem.textContent = " + ";
        actionsSectionElem.appendChild(addButtonElem);

        actionsSectionElem.appendChild(renderButton(
            ICON.EDIT,
            groupDto.groupId,
            [],
            "Add link to group",
            onClick => {
                this.log.debug("edit group: " + groupDto.title + " with id: " + groupDto.groupId + " clicked");
            }
        ));
    }

    private renderLink(link: LinkDTO, parent: HTMLElement): void {
        const linkElem: HTMLElement = document.createElement(ELEM_LINK);
        linkElem.id = link.id;
        parent.appendChild(linkElem);
    }

    private renderSubgroup(subgroup: SubgroupDTO, parent: HTMLElement): void {
        const subgroupElem: HTMLElement = document.createElement(ELEM_SUBGROUP);
        subgroupElem.id = subgroup.id;
        subgroup.links.forEach((link: LinkDTO): void => {
            this.renderLink(link, subgroupElem);
        });
        parent.appendChild(subgroupElem);
    }

    private bindComponentClassToLinkElements(): void {
        // render containers for links
        qsAll<LinkComponent>(ELEM_LINK, this)
            .forEach((l: LinkComponent) => {
                l.setRepository(this.appStateRepository);
            });
    }

    private onAddLinkButtonClick() {
        document
            .querySelector(`.${ACT_ADD_LINK}`)
            ?.addEventListener(
                "click",
                () => {
                    const title = prompt("Link title?");
                    const url = prompt("URL?");
                    this.groupViewModel.addLink(this.id, "", title, url);
                });

    }

}
