import { appStateRepository } from "./backend/repository/AppStateRepository";
import { devicePreferencesRepository } from "./backend/repository/DevicePreferencesRepository";
import { profileRepository } from "./backend/repository/ProfileRepository";
import { installationIdentity } from "./backend/sync/InstallationIdentity";
import { sessionRepository } from "./backend/sync/SessionRepository";
import { accountStandingRepository } from "./backend/sync/AccountStandingRepository";
import { backgroundImageRepository } from "./backend/repository/BackgroundImageRepository";
import { syncCoordinator } from "./backend/sync/SyncCoordinator";
import { appStateInit } from "./backend/datasource/init/AppStateInit";
import { Environment } from "./backend/entity/AppStateEntity";
import { WorkspaceDTO } from "./viewModel/abstract/dtos"

import { WorkspaceViewModel } from "./viewModel/workspaceViewModel"
import { startFairUseNotices } from "./viewModel/fairUseNoticeViewModel"
import { openFairUsePage, openPremiumUpgradePage, requestLogIn } from "./viewModel/syncAccountViewModel"
import { buildWebsiteUrl, WEBSITE_PATHS } from "./backend/sync/SyncConfiguration"

import {FirstRunComponent} from "./ui/components/firstRunComponent";
import {WorkspaceComponent} from "./ui/components/workspaceComponent";
import {GroupComponent} from "./ui/components/groupComponent";
import {LinkComponent} from "./ui/components/linkComponent";
import {SubgroupComponent} from "./ui/components/subgroupComponent";

import { consumeSettingsReopen, SettingsDialog } from "./ui/partials/settingsDialog";
import { PageBackground } from "./ui/partials/pageBackground";
import { t } from "./i18n/i18n";
import { sendToWorkerThread } from "./utils/sendToWorker";

import {
    ELEM_FIRSTRUN, ELEM_GROUP, ELEM_LINK, ELEM_SUBGROUP, ELEM_WORKSPACE
} from "./constants";

/**
 *  CSS files
 */

import './ui/styles/__variables.css'

import './ui/styles/reset.css'
import './ui/styles/main.css'
import './ui/styles/firstRun.css'
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
// The aero theme style. Not relied on to load last - see the note at the top of it.
import './ui/styles/_aero.css'

// define custom elements used BEFORE they are created/constructed
// otherwise You are unable to call custom methods for example for
// injecting repository later on them
customElements.define(ELEM_WORKSPACE, WorkspaceComponent);
customElements.define(ELEM_GROUP, GroupComponent);
customElements.define(ELEM_SUBGROUP, SubgroupComponent);
customElements.define(ELEM_LINK, LinkComponent);
customElements.define(ELEM_FIRSTRUN, FirstRunComponent);

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

    // initialize profile registry first so we know which profile to load
    await profileRepository.init();
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
    const currentEnvironment: Environment | null = appStateRepository.getCurrentEnvironment();
    const rootContainerElem = document.body.getElementsByTagName("main")[0];

    if (!currentEnvironment) {

        const guideElem = document.createElement(ELEM_FIRSTRUN) as FirstRunComponent;
        guideElem.initialize(appStateRepository);
        rootContainerElem.appendChild(guideElem);

        // This screen is chosen once, from the state as it stands right now, but an account
        // that already has links may still be arriving over the network. When it lands there
        // is a workspace to show and this screen is the wrong one, so start again.
        //
        // Only when it *lands*, though. subscribe() replays the current value to a new
        // subscriber, and the current value is the very state that chose this screen; acting
        // on that replay would reload into the same decision and reload again, several times
        // a second, for as long as the tab was open. So the replay is skipped and the reload
        // is fired at most once.
        let replayed = false;
        let reloading = false;
        appStateRepository.state$.subscribe(state => {
            if (!replayed) {
                replayed = true;
                return;
            }
            if (!reloading && Object.keys(state.environments).length > 0) {
                reloading = true;
                window.location.reload();
            }
        });

    } else {

        const workspaceDTO: WorkspaceDTO = ({
            id: currentEnvironment.id,
            title: currentEnvironment.name,
            description: currentEnvironment.description
        }) satisfies WorkspaceDTO;

        const workspaceElement = document.createElement(ELEM_WORKSPACE) as WorkspaceComponent;
        workspaceElement.initialize(appStateRepository, workspaceDTO, WorkspaceViewModel);
        rootContainerElem.appendChild(workspaceElement);
    }

    // Another account's profiles have replaced the ones this page was built from - a sign-in
    // here or in another tab. Everything on the page was drawn from the old set, so it starts
    // again from the new one, exactly as a language change does. A set being claimed by the
    // account it was just merged into changes nothing on screen, so only a change from one
    // account to another counts.
    let shownOwner = profileRepository.getOwner()?.accountId ?? null;
    profileRepository.owner$.subscribe(owner => {
        const newOwner = owner?.accountId ?? null;
        if (shownOwner !== null && newOwner !== null && newOwner !== shownOwner) {
            window.location.reload();
            return;
        }
        shownOwner = newOwner ?? shownOwner;
    });

    // A language change reloads the page, because that is the only way to redraw an interface
    // whose strings were all read as it was built. This is what brings the user back to the
    // screen they were standing on when they asked for it.
    if (consumeSettingsReopen()) {
        new SettingsDialog().show();
    }

})();
