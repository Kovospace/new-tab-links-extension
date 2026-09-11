
// data layer
import { AppState, Link, Subgroup } from "../backend/entity/AppStateEntity";

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

    /**
     *  Which way this link can be moved in the sequence it is drawn in.
     *
     *  The menu leaves out a move that would do nothing rather than offering one and ignoring
     *  the click - the first link in a group has nowhere above it, and saying so by not
     *  offering it is the only way a menu can say it.
     */
    public canMove(): { up: boolean; down: boolean } {
        return this.REPOSITORY.canMoveWithinScope(this.DTO.id);
    }

    public moveLinkUp() {
        this.REPOSITORY.moveLinkUp(this.DTO.id);
    }

    public moveLinkDown() {
        this.REPOSITORY.moveLinkDown(this.DTO.id);
    }

    public getSubgroupsForGroup(): Array<{id: string, title: string}> {
        return Object.values(this.REPOSITORY.state$.get().subgroups)
            .filter((sg: Subgroup) => sg.groupId === this.DTO.groupId)
            .map(sg => ({ id: sg.id, title: sg.title }));
    }

    public moveLinkToSubgroup(subgroupId: string): void {
        this.REPOSITORY.moveLinkToSubgroup(this.DTO.id, subgroupId);
    }

    public moveLinkOutOfSubgroup(): void {
        this.REPOSITORY.moveLinkOutOfSubgroup(this.DTO.id);
    }
}