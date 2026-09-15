import { AppStateRepository, appStateRepository } from "../backend/repository/AppStateRepository";
import { Logger } from "../utils/logger";

/**
 *  View model behind the trash the tips bar becomes while a link is being dragged.
 *
 *  It does not extend AbstractViewModel, for the reason BookmarkViewModel does not: that base
 *  class maps AppState onto a component's DTO and redraws on every change, and this has no DTO
 *  of its own to be given. What it is handed is an identifier, at the moment of the drop, and
 *  what it does with it is one thing.
 *
 *  Small on purpose, and not folded into TipsViewModel: the bar has two faces and they are two
 *  different jobs. Which tip is on screen is the profile's business; destroying a link is the
 *  workspace's, and a tips view model that could delete links would be a surprise to the next
 *  person who reads it.
 *
 *  **Nothing is asked before the link goes.** That is the same bargain the delete button on a
 *  link and the "Delete link" entry in its context menu already make - neither confirms - and a
 *  drag across the whole page onto a bar that has turned red is at least as deliberate as
 *  either. A question raised in the middle of a drag would also have to be answered after the
 *  gesture that asked it had ended, which is the worst moment to be asked anything.
 */
export class TrashViewModel {

    private LOG: Logger = new Logger("TrashViewModel");

    private readonly appState: AppStateRepository;

    /**
     *  @param appState where the profile's data lives; the singleton in normal use
     */
    constructor(appState: AppStateRepository = appStateRepository) {
        this.appState = appState;
    }

    /**
     *  Destroys a link, for good.
     *
     *  @param id the link that was dropped on the bar
     */
    public async destroyLink(id: string): Promise<void> {
        await this.appState.deleteLink(id);
        this.LOG.log("destroyLink", `Link ${id} dropped on the trash and deleted`);
    }
}
