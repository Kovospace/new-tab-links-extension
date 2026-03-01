
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

export class SubGroupViewModel extends AbstractViewModel<SubgroupDTO, SubGroupObservables> {

    protected createObservables(): GroupObservables {
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
            .map(toLinkDTO);

        // console.log(this.DTO.id);
        // console.log(result);

        this.observables.subgroup.set(result);
    }

    public addLink(title: string, url: string) {
        this.REPOSITORY.createLink(this.DTO.groupId, this.DTO.id, title, url);
    }
}