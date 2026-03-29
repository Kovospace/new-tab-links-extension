
// data layer
import { AppState, Link } from "../backend/entity/AppStateEntity";

// model layer
import { AbstractViewModel } from "../viewModel/abstract/abstractViewModel"
import { GroupDTO, SubgroupDTO, LinkDTO } from "./abstract/dtos";
import { toSubGroupDTO, toLinkDTO } from "./abstract/mappers"

// utils
import { ObservableValue } from "../utils/observableValue";



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
            .filter((link): link is LinkDTO => link !== null);

        // console.log(this.DTO.id);
        // console.log(result);

        this.observables.subgroup.set(result);
    }

    public editSubgroupTitle(id: string, title: string, description: string): void {
        title = title.trim();
        if (!title) {
            console.error("Subgroup must have title");
            return;
        }
        this.REPOSITORY.editSubGroup(id, title, description);
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