import {ObservableValue} from "../utils/observableValue";
import {AppStateRepository} from "../backend/repository/AppStateRepository";
import {Link, Subgroup} from "../backend/entity/AppStateEntity";
import {GroupItemDTO, LinkDTO, SubgroupDTO, GroupItemsDTO, GroupDTO} from "./groupViewModelInterfaces"
import {isItemInGroupAndEnv, isRootGroupLink, isSubGroupLink, isSubGroup, toSubGroupDTO, toLinkDTO} from "./groupViewModelUtils"

export class GroupViewModel {

    private repo!: AppStateRepository;
    private groupId!: string;
    private groupTitle!: string;
    private groupDescription: string;

    readonly groupItemsObservable: ObservableValue<GroupDTO>
        = new ObservableValue(null as any);

    constructor(repo: AppStateRepository, groupId: string, groupTitle: string, groupDescription: string) {
        this.repo = repo;
        this.groupId = groupId;
        this.groupTitle = groupTitle;
        this.groupDescription = groupDescription;
        this.subscriptions();
    }

    private subscriptions(): void {
        this.repo.state$
            .pick("subgroups", "links", "activeEnvironmentId")
            .subscribe(attrs => {

                //console.log("groupViewModel subscribe triggered");

                const currentEnvironmentId = attrs.activeEnvironmentId;
                const links: Link[] = Object.values(attrs.links);
                const subGroups: Subgroup[] = Object.values(attrs.subgroups);

                const result: GroupItemsDTO = [];

                // fill "root group" links into viewModel structure
                result.push(...links
                    .filter((link: Link) =>
                        isItemInGroupAndEnv(currentEnvironmentId, this.groupId)(link)
                        && isRootGroupLink()(link))
                    .map(toLinkDTO));

                // fill root groups into viewModel structure
                result.push(...subGroups
                    .filter((subgroup: Subgroup) =>
                        isItemInGroupAndEnv(currentEnvironmentId, this.groupId)(subgroup)
                        && isSubGroup()(subgroup))
                    .map(toSubGroupDTO));

                // fill "subgroup" links into each subgroups
                result
                    .filter((groupItem: GroupItemDTO) => groupItem.type === "subgroup")
                    .forEach((subGroup: SubgroupDTO) => {
                        subGroup.links
                            .push(...links
                                .filter((link: Link) => isSubGroupLink()(link))
                                .filter((link: Link) => link.subGroupId === subGroup.id)
                                .map(toLinkDTO));
                        // sort links inside subgroup
                        subGroup.links
                            .sort((a, b) => a.position - b.position);
                    });

                // sort 1st order items of group
                result
                    .sort((a, b) => a.position - b.position);

                //console.log("groupViewModel subscribe result: " + result);

                this.groupItemsObservable.set({
                    groupId: this.groupId,
                    groupItems: result,
                    title: this.groupTitle,
                    description: this.groupDescription
                } satisfies GroupDTO);
            });
    }

    public editGroupTitle(groupId: string, title: string, description: string) {
      title = title.trim();
      if (!title) {
        console.error("Group must have title");
      }
      this.repo.renameGroup(groupId, title, description);
    }

    public addLink(groupId: string, subGroupId: string, url: string, title: string): void {
        if (!groupId) {
            console.error("Link does not contain groupId where it should belong");
            return;
        }
        if (!url) {
            console.log("Link does not contains any url");
            return;
        }
        if (!title) {
            console.log("Link does not contain any title");
            return;
        }
        this.repo.createLink(groupId, subGroupId, title, url);
    }

}

