
// data layer
import {AppState, Environment, Link, Subgroup} from "../backend/entity/AppStateEntity";

// model layer
import {AbstractViewModel} from "../viewModel/abstract/abstractViewModel"
import {GroupDTO, GroupItemDTO, SubgroupDTO, LinkDTO, WorkspaceDTO} from "../viewModel/abstract/dtos"
import {toSubGroupDTO, toLinkDTO, toWorkspaceDTO} from "../viewModel/abstract/mappers"

// utils
import {ObservableValue} from "../utils/observableValue";
import {isItemInGroupAndEnv, isRootGroupLink, isSubGroupLink, isSubGroup} from "./groupViewModelUtils"



type GroupObservables = {
  group: ObservableValue<GroupDTO>
};

export class GroupViewModel extends AbstractViewModel<GroupDTO> {

    protected createObservables(): GroupObservables {
        return {
            group: new ObservableValue(null as any)
        };
    }

    protected subscribed(attrs: AppState) {

        console.log("event happened");

        const currentEnvironmentId = attrs.activeEnvironmentId!;
        const links: Link[] = Object.values(attrs.links);
        const subGroups: Subgroup[] = Object.values(attrs.subgroups);

        const result: GroupItemDTO[] = [];

        // fill "root group" links into viewModel structure
        result.push(...links
            .filter((link: Link) =>
                isItemInGroupAndEnv(currentEnvironmentId, this.DTO.id)(link)
                && isRootGroupLink()(link))
            .map(toLinkDTO)
            .map(linkDto => linkDto as GroupItemDTO));

        // fill root groups into viewModel structure
        result.push(...subGroups
            .filter((subgroup: Subgroup) =>
                isItemInGroupAndEnv(currentEnvironmentId, this.DTO.id)(subgroup)
                && isSubGroup()(subgroup))
            .map(toSubGroupDTO));

        // fill "subgroup" links into each subgroups
        result
            .filter((groupItem: GroupItemDTO) => groupItem.type === "subgroup")
            .map(groupItem => groupItem as SubgroupDTO)
            .forEach((subGroup: SubgroupDTO) => {
                if (!subGroup.links) {
                    return;
                }
                subGroup.links!
                    .push(...links
                        .filter((link: Link) => isSubGroupLink()(link))
                        .filter((link: Link) => link.subGroupId === subGroup.id)
                        .map(toLinkDTO)
                        .filter((link): link is LinkDTO => link !== null));
                // sort links inside subgroup
                if (subGroup.links) {
                    subGroup.links
                        .sort((a, b) => a.position - b.position);
                }
            });

        // sort 1st order items of group
        result
            .sort((a, b) => a.position - b.position);

        console.log("event happened end");

        this.observables.group.set({
            id: this.DTO.id,
            items: result,
            title: this.DTO.title,
            description: this.DTO.description
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

    public addLink(url: string | null, title: string | null, groupId: string, subGroupId?: string): void {
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
        this.REPOSITORY.createLink(url, title, groupId, subGroupId);
    }

    /**
     * The workspaces this group could be moved into: every one of the loaded profile except
     * the one it is already in.
     *
     * Read on demand rather than published as an observable, because it is only ever wanted
     * at the moment the menu item is picked - and a list held in an observable would be one
     * more thing to keep in step with a workspace being renamed or deleted.
     */
    public getWorkspacesToMigrateInto(): WorkspaceDTO[] {
        const currentWorkspaceId = this.REPOSITORY.getCurrentEnvironmentId();
        return this.REPOSITORY
            .getWorkspaces()
            .filter((workspace: Environment) => workspace.id !== currentWorkspaceId)
            .map(toWorkspaceDTO);
    }

    /**
     * Moves this group, with its subgroups and links, into another workspace.
     *
     * @param workspaceId the workspace to move into
     */
    public migrateToWorkspace(workspaceId: string | null): void {
        this.LOG.debug("migrateToWorkspace", `groupId: ${this.DTO.id}, workspaceId: ${workspaceId}`);
        if (!workspaceId) {
            this.LOG.debug("migrateToWorkspace", "no workspace chosen");
            return;
        }
        this.REPOSITORY.moveGroupToWorkspace(this.DTO.id, workspaceId);
    }

    public moveGroupUp(): void {
        if ((this.DTO.order ?? 0) <= 0) return;
        this.REPOSITORY.moveGroupUp(this.DTO.id);
    }

    public moveGroupDown(): void {
        this.REPOSITORY.moveGroupDown(this.DTO.id);
    }

    public addSubGroup(title: string | null, description?: string | null) {
        // if (!groupId) {
        //     console.error("groupId is missing for sub-group creation");
        // }
        if (!title) {
            console.log("subgroup title not provided for subgroup");
            return;
        }
        if (!description) {
            console.log("description not provided for subgroup");
            this.REPOSITORY.createSubGroup(this.DTO.id, this.REPOSITORY.getCurrentEnvironmentId(), title);
            return;
        }
        this.REPOSITORY.createSubGroup(this.DTO.id, this.REPOSITORY.getCurrentEnvironmentId(), title, description);
    }

}

