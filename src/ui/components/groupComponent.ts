import {AppStateRepository} from "../../backend/repository/AppStateRepository";
import {GroupViewModel} from "../../viewModel/groupViewModel";
import {GroupDTO, GroupItemDTO, LinkDTO, SubgroupDTO, GroupItemsDTO} from "../../viewModel/groupViewModelInterfaces";
import {handleReactiveRendering, qsAll} from "../../utils/firstOrderMethods";
import {renderTextContainer} from "../../utils/elementsRendering";
import {LinkComponent} from "./linkComponent"
import {SubgroupComponent} from "./subgroupComponent"
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
    CLASS_GROUP_HEAD_ACTIONS
} from "../../main"
import {renderButton, renderH1, renderContainer, ICON, renderSpan} from "../../utils/elementsRendering"
import {Logger} from "../../utils/logger";
import {WorkspaceDTO} from "../../viewModel/workspaceViewModel";

export class GroupComponent extends HTMLElement {

    private log: Logger = new Logger("GroupComponent");

    private groupViewModel!: GroupViewModel;
    private appStateRepository!: AppStateRepository;

    private description!: string;

    setRepository(repo: AppStateRepository) {
        this.appStateRepository = repo;
        this.tryInit();
    }

    setDescription(description: string) {
      this.description = description;
    }

    connectedCallback() {
        this.tryInit();
    }

    private tryInit() {
        if (!this.isConnected || !this.appStateRepository || !this.id) return;
        this.groupViewModel = new GroupViewModel(this.appStateRepository, this.id, this.title, this.description);
        this.render();
        this.attachPersistentListemers();
    }

    private render(parentElem: HTMLElement): void {

        //const parentElem: HTMLElement | null = document.getElementById(this.id);

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
            this.title, "h2", null));
        titleSectionElem.appendChild(renderTextContainer(
            this.description, "span", null));

        // buttons
        actionsSectionElem.appendChild(renderButton(
            ICON.EDIT,
            this.id,
            [ACT_EDIT_GROUP],
            "Edit group",
            onClick => {
                this.log.debug(
                    "render",
                    "edit group: " + this.title + " with id: " + this.id + " clicked");
            }
        ));
        actionsSectionElem.appendChild(renderButton(
            ICON.ADD,
            this.id,
            [ACT_ADD_LINK],
            "Add link to group",
            onClick => {
                this.log.debug(
                    "render",
                    "add link to group: " + this.title + " with id: " + this.id + " clicked");
                this.groupViewModel.addLink(this.id, null, prompt("Give URL"), prompt("Give name"));
            }
        ));

        // group body elements
        // links
        this.groupViewModel.groupItemsObservable
            .subscribe((attrs: GroupDTO) => this.renderGroupItems(bodyElem, attrs));
    }

    private attachListeners() {
      this.listenerChangeGroupName();
    }

    private renderGroupItems(parentElem: HTMLElement, groupDto: GroupDTO): void {
        handleReactiveRendering<GroupItemDTO, HTMLButtonElement>(
            parentElem,
            groupDto.groupItems,
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
        linkElem.id = link.id;
        linkElem.setRepository(this.appStateRepository);
        return linkElem;
    }

    private renderSubgroup(subgroup: SubgroupDTO): HTMLElement {
        const subgroupElem = document.createElement(ELEM_SUBGROUP) as SubgroupComponent;
        subgroupElem.id = subgroup.id;
        subgroupElem.setRepository(this.appStateRepository);
        subgroup.links.forEach((link: LinkDTO): void => {
            subgroupElem.appendChild(this.renderLink(link));
        });
        return subgroupElem;
    }

    private listenerChangeGroupName() {

      const titleAndDescParentContainer = this.getElementsByClassName(CLASS_GROUP_HEAD_TITLE)[0];
      const editButton = this.getElementsByClassName(ACT_EDIT_GROUP)[0];
      const titleElem = titleAndDescParentContainer.querySelectorAll(":scope > h2")[0];
      const descriptionElem = titleAndDescParentContainer.querySelectorAll(":scope > span")[0];

      editButton.addEventListener('click', (event) => {
        editButton.classList.toggle('active');
        titleElem.toggleAttribute('contentEditable');
        descriptionElem.toggleAttribute('contentEditable');
        if (!editButton.classList.contains('active')) {
          // console.log('teraz ulož');
          this.groupViewModel.editGroupTitle(this.id, titleElem.textContent, descriptionElem.textContent);
        }
      });

      titleElem.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault(); // prevent new lines
          // cosole.log("enteeeer h2");
        }
      })

      titleElem.addEventListener('blur', () => {
        // console.log("bluuuuur h2");
        // console.log('teraz ulož');
        this.groupViewModel.editGroupTitle(this.id, titleElem.textContent, descriptionElem.textContent);
      });

      descriptionElem.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault(); // prevent new lines
          cosole.log("enteeeer span");
        }
      })

      descriptionElem.addEventListener('blur', () => {
        // console.log("bluuuuur span");
        // console.log('teraz ulož');
        this.groupViewModel.editGroupTitle(this.id, titleElem.textContent, descriptionElem.textContent);
      });
    }

}
