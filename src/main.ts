import { appStateRepository } from "./backend/repository/AppStateRepository";
import { devicePreferencesRepository } from "./backend/repository/DevicePreferencesRepository";
import { profileRepository } from "./backend/repository/ProfileRepository";
import { installationIdentity } from "./backend/sync/InstallationIdentity";
import { sessionRepository } from "./backend/sync/SessionRepository";
import { accountStandingRepository } from "./backend/sync/AccountStandingRepository";
import { backgroundImageRepository } from "./backend/repository/BackgroundImageRepository";
import { backgroundLibraryRepository } from "./backend/repository/BackgroundLibraryRepository";
import { groupSizeRepository } from "./backend/repository/GroupSizeRepository";
import { workspaceWelcomeRepository } from "./backend/repository/WorkspaceWelcomeRepository";
import { syncCoordinator, SyncActivity } from "./backend/sync/SyncCoordinator";
import { appStateInit } from "./backend/datasource/init/AppStateInit";
import { AppState, Environment } from "./backend/entity/AppStateEntity";
import { WorkspaceDTO } from "./viewModel/abstract/dtos"

import { WorkspaceViewModel } from "./viewModel/workspaceViewModel"
import { startFairUseNotices } from "./viewModel/fairUseNoticeViewModel"
import { openFairUsePage, openPremiumUpgradePage, requestLogIn, SyncAccountViewModel } from "./viewModel/syncAccountViewModel"
import { buildWebsiteUrl, WEBSITE_PATHS } from "./backend/sync/SyncConfiguration"

import {WorkspaceComponent} from "./ui/components/workspaceComponent";
import {GroupComponent} from "./ui/components/groupComponent";
import {LinkComponent} from "./ui/components/linkComponent";
import {SubgroupComponent} from "./ui/components/subgroupComponent";

import { consumeSettingsReopen, SettingsDialog } from "./ui/partials/settingsDialog";
import { renderWorkspaceLessPage } from "./ui/partials/workspaceLessPage";
import { WorkspaceLessViewModel } from "./viewModel/workspaceLessViewModel";
import { followFavoritesSwitch } from "./viewModel/favorites";
import { LANGUAGE_CATEGORY } from "./viewModel/settingsViewModel";
import { PageBackground } from "./ui/partials/pageBackground";
import { t } from "./i18n/i18n";
import { sendToWorkerThread } from "./utils/sendToWorker";
import { pageReloads } from "./utils/pageReload";

import {
    ELEM_GROUP, ELEM_LINK, ELEM_SUBGROUP, ELEM_WORKSPACE
} from "./constants";

/**
 *  CSS files
 */

import './ui/styles/__variables.css'
import './ui/styles/__transitions.css'
import './ui/styles/__3d_effects.css'

import './ui/styles/reset.css'
import './ui/styles/main.css'
import './ui/styles/workspace.css'
import './ui/styles/group.css'
import './ui/styles/subgroup.css'
import './ui/styles/link.css'

import './ui/styles/_optionsMenu.css'
import './ui/styles/_inputDialog.css'
import './ui/styles/_profileManager.css'
import './ui/styles/_settingsDialog.css'
import './ui/styles/_tipsBar.css'
import './ui/styles/_adsBar.css'
import './ui/styles/_searchBar.css'
import './ui/styles/_dragAndDrop.css'
import './ui/styles/_closedTabs.css'
import './ui/styles/_welcome.css'
// The aero theme style. Not relied on to load last - see the note at the top of it.
import './ui/styles/_aero.css'

// define custom elements used BEFORE they are created/constructed
// otherwise You are unable to call custom methods for example for
// injecting repository later on them
customElements.define(ELEM_WORKSPACE, WorkspaceComponent);
customElements.define(ELEM_GROUP, GroupComponent);
customElements.define(ELEM_SUBGROUP, SubgroupComponent);
customElements.define(ELEM_LINK, LinkComponent);

(async () => {

    // One more new tab, for the anonymous daily count. Counted by the service worker, which
    // also decides when to report; not awaited, because nothing on this page depends on it.
    sendToWorkerThread("usageStats", "recordNewTab", {}).catch(() => undefined);

    // How big this browser wants the interface, applied before anything is drawn: everything
    // here is sized in em, so this one number moves the lot, and applying it later would
    // redraw the page a size larger in front of the user.
    await devicePreferencesRepository.init();
    devicePreferencesRepository.applyScale();
    // Light or dark, before anything is drawn, and again whenever any page of this browser
    // changes it.
    devicePreferencesRepository.followTheme();

    // Which language this page is drawn in, settled before any component is constructed:
    // every string here is read once, while its element is being built.
    devicePreferencesRepository.applyLocale();
    document.title = t("workspace.pageTitle");

    // identity of this installation and the signed-in account, if any - both are read
    // before anything renders so the application menu draws its final state at once
    await installationIdentity.init();
    await sessionRepository.init();
    // Whether the account is premium, from what was last known - before anything is drawn, so
    // a premium user's page never shows an advertisement while the account is being asked.
    await accountStandingRepository.init();
    // A premium user's own background, read before drawing for the same reason: the logo
    // should not flash in the corner of a page that is about to be covered by a picture.
    await backgroundImageRepository.init();
    new PageBackground().render();
    // A fresh install's default picture (#175), downloaded while the page draws, not before.
    void backgroundLibraryRepository.applyInstallDefault();
    // Groups resized by hand (#173), read before any group is drawn so none of them jumps.
    await groupSizeRepository.init();
    // Which empty workspaces already had their welcome on this browser (#182).
    await workspaceWelcomeRepository.init();

    // initialize profile registry first so we know which profile to load
    await profileRepository.init();
    // Favorites switched on for this profile show their circles (#183), from any page.
    followFavoritesSwitch();
    // initialize "app data" object and repository, WAIT FOR IT !!!
    await appStateRepository.init(appStateInit, profileRepository.getActiveProfileId());

    // A fair use or free plan limit stopping an addition - here or, through synchronisation, on the
    // account - is said in a notice; the repositories only refuse and publish.
    startFairUseNotices({
        openUpgradePage: () => openPremiumUpgradePage(),
        openFairUsePage: () => openFairUsePage(),
        openRegistrationPage: () => void chrome.tabs.create({ url: buildWebsiteUrl(WEBSITE_PATHS.register) }),
        openLogIn: () => requestLogIn(),
        isSignedIn: () => sessionRepository.isSignedIn()
    });

    // Synchronisation watches the repositories above, so it starts after them. It is not
    // awaited to completion: a signed-in device pushes and pulls in the background while the
    // page renders what it already has, and the page redraws itself when the account answers.
    await syncCoordinator.start();

    // create custom HTML element ONLY THAT WAY otherwise (innerHTML() method or
    // raw in html file) construction of object happens before initialized "repository"
    // is injected and program crashes
    const rootContainerElem = document.body.getElementsByTagName("main")[0];
    const currentEnvironment: Environment | null = await environmentToOpen(rootContainerElem);

    if (!currentEnvironment) {
        // The user deleted every workspace (#182): the page with no workspace, until they make
        // one, bring one in, or an account's arrive - which reloads into them.
        renderWorkspaceLessPage(
            rootContainerElem,
            new WorkspaceLessViewModel(appStateRepository, workspaceWelcomeRepository),
            accountViewModelForPage(),
            sessionRepository.isSignedIn());
        let arrived = false;
        appStateRepository.state$.subscribe((state: AppState) => {
            if (!arrived && Object.keys(state.environments).length > 0) {
                arrived = true;
                pageReloads.request();
            }
        });
        return;
    }
    // A profile emptied by the user that has a workspace again, from any direction.
    void workspaceWelcomeRepository.clearEmptiedByUser(appStateRepository.getActiveProfileId());

    const workspaceDTO: WorkspaceDTO = ({
        id: currentEnvironment.id,
        title: currentEnvironment.name,
        description: currentEnvironment.description
    }) satisfies WorkspaceDTO;

    const workspaceElement = document.createElement(ELEM_WORKSPACE) as WorkspaceComponent;
    workspaceElement.initialize(appStateRepository, workspaceDTO, WorkspaceViewModel);
    rootContainerElem.appendChild(workspaceElement);

    // The profile was left with no workspace at all: its last one deleted, its untouched
    // starter removed by a sign-in, a switch to an empty profile. Everything on the page is
    // drawn for a workspace, so the page starts again and opens with a fresh one.
    let emptied = false;
    appStateRepository.state$.subscribe((state: AppState) => {
        if (!emptied && Object.keys(state.environments).length === 0) {
            emptied = true;
            pageReloads.request();
        }
    });

    // Another account's profiles have replaced the ones this page was built from - a sign-in
    // here or in another tab. Everything on the page was drawn from the old set, so it starts
    // again from the new one, exactly as a language change does. A set being claimed by the
    // account it was just merged into changes nothing on screen, so only a change from one
    // account to another counts.
    let shownOwner = profileRepository.getOwner()?.accountId ?? null;
    profileRepository.owner$.subscribe(owner => {
        const newOwner = owner?.accountId ?? null;
        if (shownOwner !== null && newOwner !== null && newOwner !== shownOwner) {
            pageReloads.request();
            return;
        }
        shownOwner = newOwner ?? shownOwner;
    });

    // A language change reloads the page, because that is the only way to redraw an interface
    // whose strings were all read as it was built. This is what brings the user back to the
    // screen they were standing on when they asked for it.
    if (consumeSettingsReopen()) {
        new SettingsDialog().show(LANGUAGE_CATEGORY);
    }

})();


/** How long a signed-in page waits for its account's workspaces before making its own. */
const ACCOUNT_ARRIVAL_TIMEOUT_MS = 15000;

/**
 *  The workspace the page opens on, or null for the page with no workspace. There is no
 *  first-run screen (#182): a profile with no workspace is given one, the starter
 *  (`AppStateRepository.addStarterWorkspace`), and the page goes straight into it. The
 *  widget there offers the ways to fill it. The exception is a profile whose last workspace
 *  the user deleted on this browser: that one gets the page with no workspace instead.
 *
 *  A browser that synchronises waits for its account first. The account's workspaces may be
 *  on their way, and a starter made before they land would only be one more workspace to
 *  throw away. So the page says it is loading until the first synchronisation has finished,
 *  or until a timeout runs out, and makes the starter only if nothing arrived. One made
 *  anyway is still harmless: untouched, it is never synchronised, and first contact drops it.
 *
 *  @param host where the waiting notice is shown meanwhile
 */
async function environmentToOpen(host: HTMLElement): Promise<Environment | null> {
    const existing = appStateRepository.getCurrentEnvironment();
    if (existing) return existing;

    if (sessionRepository.isSignedIn() && devicePreferencesRepository.preferences$.get().syncEnabled) {
        const notice = document.createElement("p");
        notice.classList.add("account-arrival-notice");
        notice.textContent = t("workspace.loadingFromAccount");
        host.appendChild(notice);
        await accountArrival();
        notice.remove();
        const arrived = appStateRepository.getCurrentEnvironment();
        if (arrived) return arrived;
    }

    if (workspaceWelcomeRepository.wasEmptiedByUser(appStateRepository.getActiveProfileId())) {
        return null;
    }
    await appStateRepository.addStarterWorkspace(t("workspace.starterName"));
    return appStateRepository.getCurrentEnvironment()!;
}

/**
 *  Resolves once the open profile holds a workspace, a synchronisation has started and
 *  finished, or the timeout ran out - whichever comes first.
 */
function accountArrival(): Promise<void> {
    return new Promise<void>(resolve => {
        let done = false;
        let started = false;
        const finish = (): void => {
            if (done) return;
            done = true;
            resolve();
        };
        setTimeout(finish, ACCOUNT_ARRIVAL_TIMEOUT_MS);
        appStateRepository.state$.subscribe(state => {
            if (Object.keys(state.environments).length > 0) finish();
        });
        syncCoordinator.activity$.subscribe((activity: SyncActivity) => {
            if (activity === "working") {
                started = true;
            } else if (started || activity === "offline") {
                finish();
            }
        });
    });
}

/** The account view model the page with no workspace signs in through. */
function accountViewModelForPage(): SyncAccountViewModel {
    const account = new SyncAccountViewModel();
    account.initialize();
    return account;
}
