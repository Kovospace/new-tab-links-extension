
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

    /**
     *  Puts this link where a drop asked for it.
     *
     *  The index is into the sequence the group draws, which at root level counts the
     *  subgroups between the links - see the repository, which owns that rule.
     *
     *  @param groupId    the group it should belong to
     *  @param subGroupId the subgroup within it, or undefined for the group itself
     *  @param index      where in that sequence
     */
    public moveTo(groupId: string, subGroupId: string | undefined, index: number): void {
        this.LOG.debug("moveTo", `${this.DTO.id} -> ${groupId}/${subGroupId ?? "-"}@${index}`);
        this.REPOSITORY.moveLinkTo(this.DTO.id, groupId, subGroupId, index);
    }

    /**
     *  Where this link sits in the sequence it is drawn in, so a drop beside it knows the
     *  index it is aiming at.
     */
    public indexInScope(): number {
        return this.REPOSITORY.indexInScope(this.DTO.id);
    }

    /**
     *  Takes another link into this one's place in the sequence.
     *
     *  What a drop onto this link means: the dragged one goes where this one is, or just
     *  after it, and in this one's group and subgroup - which is how a link crosses from one
     *  group to another without anything else being said.
     *
     *  @param draggedId the link that was dropped
     *  @param index     where it goes, counted in the sequence as it is drawn
     */
    public acceptLink(draggedId: string, index: number): void {
        this.LOG.debug("acceptLink", `${draggedId} -> beside ${this.DTO.id} at ${index}`);
        this.REPOSITORY.moveLinkTo(
            draggedId, this.DTO.groupId, this.DTO.subGroupId, index);
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