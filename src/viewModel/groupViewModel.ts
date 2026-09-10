
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
        // The dialog refuses to submit this, so reaching here means a caller that did not go
        // through one. Refusing rather than renaming the group to nothing.
        this.LOG.debug("editGroupTitle", "Refusing a group with no title");
        return;
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
        // Backstops, all three. The dialog will not submit a link without a title or an
        // address, so what these catch is a caller that did not come through the dialog -
        // and the user is told by the dialog, not from here.
        if (!groupId) {
            this.LOG.debug("addLink", "Refusing a link that names no group");
            return;
        }
        if (!url) {
            this.LOG.debug("addLink", "Refusing a link with no address");
            return;
        }
        if (!title) {
            this.LOG.debug("addLink", "Refusing a link with no title");
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
        if (!title) {
            // The dialog refuses this; the backstop is for callers that are not the dialog.
            this.LOG.debug("addSubGroup", "Refusing a subgroup with no title");
            return;
        }
        if (!description) {
            // Not a refusal: a description is optional, and one that was left blank simply
            // is not passed on.
            this.REPOSITORY.createSubGroup(this.DTO.id, this.REPOSITORY.getCurrentEnvironmentId(), title);
            return;
        }
        this.REPOSITORY.createSubGroup(this.DTO.id, this.REPOSITORY.getCurrentEnvironmentId(), title, description);
    }

}

