
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

export class LinkViewModel extends AbstractViewModel<LinkDTO> {

    protected createObservables(): LinkObservables {
        return {
          link: new ObservableValue<LinkDTO>(null as any)
        };
    }

    protected subscribed(attrs: AppState) {

        const result: LinkDTO | null = toLinkDTO(Object
            .values(attrs.links)
            .find((link: Link) => link.id === this.DTO.id));

        if (!result) {
            return;
        }

        this.observables.link.set(result);
    }

    public deleteLink() {
        this.REPOSITORY.deleteLink(this.DTO.id);
    }

    public editLink(title: string | null, url: string | null) {
        if (!title) {
            return;
        }
        if (!url) {
            return;
        }
        this.REPOSITORY.editLink(url, title, this.DTO.id, this.DTO.groupId, this.DTO.subGroupId, this.DTO.workspaceId);
    }

    public moveLinkUp() {
        if (this.DTO.position <= 0) {
            return;
        }
        this.REPOSITORY.editLink(this.DTO.url, this.DTO.title, this.DTO.id, this.DTO.groupId, this.DTO.subGroupId, this.DTO.workspaceId, this.DTO.position - 1);
    }

    public moveLinkDown() {
        this.REPOSITORY.editLink(this.DTO.url, this.DTO.title, this.DTO.id, this.DTO.groupId, this.DTO.subGroupId, this.DTO.workspaceId, this.DTO.position + 1);
    }
}