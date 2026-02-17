import {AppStateRepository} from "../backend/repository/AppStateRepository";
import {Link} from "../backend/entity/AppStateEntity";
import {ObservableValue} from "../utils/observableValue";

export interface LinkDTO {
    title: string;
    url: string;
}

export class LinkViewModel {

    readonly linkObservable: ObservableValue<LinkDTO> = new ObservableValue<LinkDTO>();

    private toLinkDTO = (link: Link): LinkDTO => ({
        title: link.title,
        url: link.url,
    });


    constructor(repo: AppStateRepository, linkId: string) {
        repo.state$
            .pick("links")
            .subscribe(attrs => {

                console.log("linkViemModel subscribe triggered");

                const result: LinkDTO = this.toLinkDTO(Object
                    .values(attrs.links)
                    .find((link: Link) => link.id === linkId));

                this.linkObservable.set(result)
            });
    }
}