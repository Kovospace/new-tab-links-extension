
// data layer
import { AppState, Link } from "../backend/entity/AppStateEntity";

// model layer
import { AbstractViewModel } from "../viewModel/abstract/abstractViewModel"
import { GroupDTO, SubgroupDTO, LinkDTO } from "./abstract/dtos";
import { toSubGroupDTO, toLinkDTO } from "./abstract/mappers"

// utils
import { ObservableValue } from "../utils/observableValue";
import { TabGroupColor } from "../backend/entity/TabGroupColors";



type SubGroupObservables = {
    subgroup: ObservableValue<SubgroupDTO>//,
    //links: ObservableValue<LinkDTO>
};

export class SubGroupViewModel extends AbstractViewModel<SubgroupDTO> {

    protected createObservables(): SubGroupObservables {
        return {
            subgroup: new ObservableValue(null as any)//,
            //links: new ObservableValue([])
        };
    }

    protected subscribed(attrs: AppState) {

        const result: SubgroupDTO = toSubGroupDTO(attrs.subgroups[this.DTO.id]);
        result.links = Object
            .values(attrs.links)
            .filter((link: Link) => link.subGroupId === this.DTO.id)
            .map(toLinkDTO)
            .filter((link): link is LinkDTO => link !== null)
            .sort((a, b) => a.position - b.position);

        // console.log(this.DTO.id);
        // console.log(result);

        this.observables.subgroup.set(result);
    }

    public editSubgroupTitle(id: string, title: string, description: string): void {
        title = title.trim();
        if (!title) {
            // The dialog refuses to submit this; the backstop is for callers that are not it.
            this.LOG.debug("editSubgroupTitle", "Refusing a subgroup with no title");
            return;
        }
        this.REPOSITORY.editSubGroup(id, title, description);
    }

    /**
     *  Paints this subgroup's tab group a different colour.
     *
     *  @param color one of the nine colours Chrome accepts
     */
    public setColor(color: TabGroupColor): void {
        this.LOG.debug("setColor", `id: ${this.DTO.id}, color: ${color}`);
        this.REPOSITORY.setSubgroupColor(this.DTO.id, color);
    }

    public deleteSubgroup(id: string): void {
        this.REPOSITORY.deleteSubGroup(id);
    }

    public moveLinksOutOfSubgroup(id: string): void {
        this.REPOSITORY.moveLinksFromSubgroup(id);
    }

    public deleteSubgroupAndMoveLinks(id: string): void {
        this.REPOSITORY.ceaseSubgroup(id);
    }

    public moveSubgroupUp(): void {
        if (this.DTO.position <= 0) return;
        this.REPOSITORY.moveSubgroupUp(this.DTO.id);
    }

    public moveSubgroupDown(): void {
        this.REPOSITORY.moveSubgroupDown(this.DTO.id);
    }

    public toggleCatchLinksIntoTabGroup(): void {
        this.REPOSITORY.toggleSubgroupCatchLinksIntoTabGroup(this.DTO.id);
    }

    public toggleCollapsed(): void {
        this.REPOSITORY.toggleSubgroupCollapsed(this.DTO.id);
        // state$ is intentionally not fired — the component toggles the class directly
    }

    public addLink(title: string | null, url: string | null): void {
        if (!title) {
            //TODO validations for user
            return;
        }
        if (!url) {
            //TODO validations for user
            return;
        }
        this.REPOSITORY.createLink(url, title, this.DTO.groupId, this.DTO.id);
    }
}