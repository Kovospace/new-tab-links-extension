
// data layer
import { AppState, Link } from "../backend/entity/AppStateEntity";

// model layer
import { AbstractViewModel } from "../viewModel/abstract/abstractViewModel"
import { LinkDTO } from "./abstract/dtos";
import { toLinkDTO } from "./abstract/mappers";

// utils
import { ObservableValue } from "../utils/observableValue";



type LinkObservables = {
    link: ObservableValue<LinkDTO>
};

export class LinkViewModel extends AbstractViewModel<LinkDTO, LinkObservables> {

    protected createObservables() {
        return {
          link: new ObservableValue<LinkDTO>(null as any)
        };
    }

    protected subscribed(attrs: AppState) {

        const result: LinkDTO = toLinkDTO(Object
            .values(attrs.links)
            .find((link: Link) => link.id === this.DTO.id));

        //console.log(result);

        this.observables.link.set(result);
    }
}