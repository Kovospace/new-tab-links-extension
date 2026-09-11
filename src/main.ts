import { appStateRepository } from "./backend/repository/AppStateRepository";
import { devicePreferencesRepository } from "./backend/repository/DevicePreferencesRepository";
import { profileRepository } from "./backend/repository/ProfileRepository";
import { installationIdentity } from "./backend/sync/InstallationIdentity";
import { sessionRepository } from "./backend/sync/SessionRepository";
import { syncCoordinator } from "./backend/sync/SyncCoordinator";
import { appStateInit } from "./backend/datasource/init/AppStateInit";
import { Environment } from "./backend/entity/AppStateEntity";
import { WorkspaceDTO } from "./viewModel/abstract/dtos"

import { WorkspaceViewModel } from "./viewModel/workspaceViewModel"

import {FirstRunComponent} from "./ui/components/firstRunComponent";
import {WorkspaceComponent} from "./ui/components/workspaceComponent";
import {GroupComponent} from "./ui/components/groupComponent";
import {LinkComponent} from "./ui/components/linkComponent";
import {SubgroupComponent} from "./ui/components/subgroupComponent";

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
import './ui/styles/_closedTabs.css'

// define custom elements used BEFORE they are created/constructed
// otherwise You are unable to call custom methods for example for
// injecting repository later on them
customElements.define(ELEM_WORKSPACE, WorkspaceComponent);
customElements.define(ELEM_GROUP, GroupComponent);
customElements.define(ELEM_SUBGROUP, SubgroupComponent);
customElements.define(ELEM_LINK, LinkComponent);
customElements.define(ELEM_FIRSTRUN, FirstRunComponent);

(async () => {

    // How big this browser wants the interface, applied before anything is drawn: everything
    // here is sized in em, so this one number moves the lot, and applying it later would
    // redraw the page a size larger in front of the user.
    await devicePreferencesRepository.init();
    devicePreferencesRepository.applyScale();

    // identity of this installation and the signed-in account, if any - both are read
    // before anything renders so the application menu draws its final state at once
    await installationIdentity.init();
    await sessionRepository.init();

    // initialize profile registry first so we know which profile to load
    await profileRepository.init();
    // initialize "app data" object and repository, WAIT FOR IT !!!
    await appStateRepository.init(appStateInit, profileRepository.getActiveProfileId());

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

})();
