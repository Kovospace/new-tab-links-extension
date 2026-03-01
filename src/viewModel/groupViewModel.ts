
// data layer
import {AppStateRepository} from "../backend/repository/AppStateRepository";
import {AppState, Link, Subgroup} from "../backend/entity/AppStateEntity";

// model layer
import {AbstractViewModel} from "../viewModel/abstract/abstractViewModel"
import {GroupDTO, GroupItemDTO, SubgroupDTO, LinkDTO} from "../viewModel/abstract/dtos"
import {toSubGroupDTO, toLinkDTO} from "../viewModel/abstract/mappers"

// utils
import {ObservableValue} from "../utils/observableValue";
import {isItemInGroupAndEnv, isRootGroupLink, isSubGroupLink, isSubGroup} from "./groupViewModelUtils"



type GroupObservables = {
  group: ObservableValue<GroupDTO>
};

export class GroupViewModel extends AbstractViewModel<GroupDTO, GroupObservables> {

    protected createObservables(): GroupObservables {
        return {
            group: new ObservableValue(null as any)
        };
    }

    protected subscribed(attrs: AppState) {

        console.log("event happened");

        const currentEnvironmentId = attrs.activeEnvironmentId;
        const links: Link[] = Object.values(attrs.links);
        const subGroups: Subgroup[] = Object.values(attrs.subgroups);

        const result: GroupItemDTO[] = [];

        // fill "root group" links into viewModel structure
        result.push(...links
            .filter((link: Link) =>
                isItemInGroupAndEnv(currentEnvironmentId, this.DTO.id)(link)
                && isRootGroupLink()(link))
            .map(toLinkDTO));

        // fill root groups into viewModel structure
        result.push(...subGroups
            .filter((subgroup: Subgroup) =>
                isItemInGroupAndEnv(currentEnvironmentId, this.DTO.id)(subgroup)
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

        console.log("event happened end");

        this.observables.group.set({
            id: this.groupId,
            items: result,
            title: this.groupTitle,
            description: this.groupDescription
        } satisfies GroupDTO);
    }

    public editGroupTitle(groupId: string, title: string, description: string) {
      title = title.trim();
      if (!title) {
        console.error("Group must have title");
      }
      this.REPOSITORY.renameGroup(groupId, title, description);
    }

    public deleteGroup(id: string) {
        this.REPOSITORY.deleteGroup(id);
    }

    public addLink(groupId: string, subGroupId?: string, url: string, title: string): void {
        this.LOG.debug(
            "addLink",
            `groupId: ${groupId}, subGroupId: ${subGroupId}, url: ${url}, title: ${title}`);
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
        this.REPOSITORY.createLink(groupId, subGroupId, title, url);
    }

    public addSubGroup(title: string, description: string) {
        // if (!groupId) {
        //     console.error("groupId is missing for sub-group creation");
        // }
        if (!title) {
            console.log("subgroup title not provided for subgroup");
            return;
        }
        if (!description) {
            console.log("description not provided for subgroup");
        }
        this.REPOSITORY.createSubGroup(title, description, this.DTO.id);
    }

}

