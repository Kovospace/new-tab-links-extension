import { AppStateRepository, appStateRepository } from "../backend/repository/AppStateRepository";
import { ProfileRepository, profileRepository } from "../backend/repository/ProfileRepository";
import { ObservableValue } from "../utils/observableValue";
import { BROWSER_PAGE_OPENER, openPage, OpenWhere, PageOpener } from "../utils/pageOpener";
import { favoritesEnabled, FavoriteDTO, favoritesOfWorkspace } from "./favorites";

/**
 *  The side panel's Favorites card (#183): the open workspace's favorites, in the order the
 *  page draws them, while the profile uses favorites - and nothing while it does not.
 */
export class FavoritesViewModel {

    public readonly observables = {
        favorites: new ObservableValue<FavoriteDTO[]>([]),
        enabled: new ObservableValue<boolean>(false)
    };

    private unsubscribes: Array<() => void> = [];

    constructor(
        private readonly appState: AppStateRepository = appStateRepository,
        private readonly profiles: ProfileRepository = profileRepository,
        private readonly opener: PageOpener = BROWSER_PAGE_OPENER
    ) {}

    public initialize(): void {
        this.unsubscribes.push(
            this.appState.state$.subscribe(() => this.refresh()),
            this.profiles.profiles$.subscribe(() => this.refresh()));
    }

    public dispose(): void {
        this.unsubscribes.forEach(unsubscribe => unsubscribe());
        this.unsubscribes = [];
    }

    /** Opens a favorite in this tab, as a link on the page does, or in a new one. */
    public open(url: string, where: OpenWhere): void {
        openPage(this.opener, url, where);
    }

    /** Marks a link as a favorite - a link dropped on the card. It stays in its group. */
    public markFavorite(linkId: string): Promise<unknown> {
        return this.appState.setLinkFavorite(linkId, true);
    }

    /** No longer a favorite. The link itself stays where it is. */
    public unmark(linkId: string): Promise<unknown> {
        return this.appState.setLinkFavorite(linkId, false);
    }

    private refresh(): void {
        const enabled = favoritesEnabled(this.profiles);
        this.observables.enabled.set(enabled);
        if (!enabled) {
            this.observables.favorites.set([]);
            return;
        }
        const workspaceId = this.appState.getCurrentEnvironmentId();
        this.observables.favorites.set(workspaceId
            ? favoritesOfWorkspace(this.appState.state$.get(), workspaceId)
            : []);
    }
}
