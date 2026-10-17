# Code map

Where things are, so that nobody lists the source tree to find out. Paths are relative to
`src/`; tests mirror them under `test/` (`test/backend/sync/ChangeSetBuilder.test.ts` covers
`src/backend/sync/ChangeSetBuilder.ts`), with fakes in `test/support/`.
Keep it current: a new module or a new concern adds a row here.

## Where to look for…

| Concern | File |
|---|---|
| The data model — `AppState`, `Profile`, `ProfileData`, every entity | `backend/entity/AppStateEntity.ts` |
| All state CRUD (immutable, spread-based) | `backend/repository/AppStateRepository.ts` — **1248 lines, read by range** |
| Profiles, their registry, import/export | `backend/repository/ProfileRepository.ts`, `backend/repository/ProfileDataTransfer.ts` |
| Limits - every number in one place (free / premium FUP, backend names), growth checks, refusal kinds; the account's effective limits (`GET /users/me/plan-limits`, snapshot `planLimits`) published as `planLimits$` | `backend/entity/PlanLimits.ts`, `backend/repository/PremiumStanding.ts` (`planLimits$`, `readStoredPlanLimits` for the worker), `backend/sync/AccountStandingRepository.ts`; enforced in `AppStateRepository` (`refused`, `roomForLinks`), `ProfileRepository.createProfile`, `recordClosedTab` (rolling cap); refusals published on `FairUseRefusals`, said by `viewModel/fairUseNoticeViewModel.ts`; 409 read in `BackendApiClient.limitRefusalIn` |
| Slots - what synchronises (first N by the account's `createdAt`), push/pull confined to them, pull never erasing local-only data, merge within Fair Use caps, name matching at first contact | `backend/sync/SyncSlots.ts` (`decideSyncScope`), `backend/sync/ScopedSync.ts` (`restrictToScope`, `baselineAfter`, `pulledProfileData`), `backend/sync/CappedMerge.ts`; used in `SyncCoordinator` (`prepareChangeSet`, `send` - one retry on 409, `pull`/`applySnapshot`, `mergeWithAccount`, `adoptNameMatches`); published as `SyncCoordinator.scope$` |
| Inventory report to the account (names and counts per profile/workspace, sync state) | `backend/sync/InventoryReporter.ts`, called from `SyncCoordinator.reportInventory` after each cycle |
| Example data flag (fingerprint on the workspace, `example` on the profile), cleared on edit, removed at sign-in | `backend/entity/ExampleData.ts` (settled in `AppStateRepository.save`), `backend/sync/ExampleDataRemoval.ts` (called from `SyncAccountViewModel.storeIssuedTokens`), set in `viewModel/firstRunViewModel.ts` |
| Unsynchronised marks: crossed sync icon on profiles, workspace notice in the head, rename advice | `viewModel/syncStateViewModel.ts`; `ui/partials/optionsMenu.ts` (`notSynced`), `ui/partials/profileManagerDialog.ts`, `ui/components/workspaceComponent.ts` (`workspaceSyncNotice`) |
| Device limit and revoked sessions - the 409 `DEVICES` on sign-in (with `manageUrl`), a session the account ended (`SessionRepository.revoked$`) | `viewModel/syncAccountViewModel.ts` (`offerDeviceLimitWayOut`, `explainRevokedSession`) |
| Per-browser preferences (not synced) | `backend/repository/DevicePreferencesRepository.ts` |
| Light / dark theme - the palette as `light-dark()` pairs, `data-theme` on the root | `ui/styles/__variables.css`, `DevicePreferencesRepository` (`theme`, `followTheme`) |
| Recently closed tabs | `backend/repository/ClosedTabsRepository.ts`, `backend/worker/module/closedTabsRecorder.ts`, `ui/partials/closedTabsPanel.ts` |
| Browsing history - the side panel's third card, recorded only when the profile turns it on, synchronised like closed tabs | `backend/entity/VisitEntity.ts`, `backend/repository/VisitsRepository.ts`, `backend/worker/module/historyRecorder.ts`, `viewModel/historyViewModel.ts`, `ui/partials/historyCard.ts`; rows shared with the other cards in `ui/partials/sidePanelRows.ts` |
| Open tabs of this browser - the side panel's second card (local only) | `viewModel/openTabsViewModel.ts`, drawn by `ui/partials/closedTabsPanel.ts`; the chosen card is `sidePanelCard` in `DevicePreferencesRepository` |
| `chrome.storage.local` keys | `backend/datasource/chromeStorage/storageKeys.ts` |
| First-run state | `backend/datasource/init/AppStateInit.ts` |
| Element, action and class names | `constants.ts` (not `main.ts`) |
| **Sync** — the loop: debounce, push, pull, merge, retry | `backend/sync/SyncCoordinator.ts` — **~1450 lines, read by range** |
| Sync — the wire contract with the backend | `backend/sync/SyncContracts.ts` |
| Sync — HTTP calls | `backend/sync/BackendApiClient.ts` |
| Sync — environment values, every endpoint path, the device headers | `backend/sync/SyncConfiguration.ts` |
| Sync — tokens, sign-in state | `backend/sync/SessionRepository.ts` |
| Whose profiles are visible — ownership, hidden sets per account, the swap at sign-in | `backend/repository/ProfileRepository.ts` (`showAccount`, `claimFor`), `backend/sync/SyncCoordinator.ts` (`showProfilesOf`) |
| Whether the account is premium (hides the ad slot and the upgrade offer); polled, and read as free when the check looks blocked | `backend/sync/AccountStandingRepository.ts`, `backend/sync/ReachabilityProbe.ts` |
| Synchronisation switched off on this browser while signed in (`syncEnabled`), the sign-in dialogs' checkbox, the menu's status checkbox | `backend/repository/DevicePreferencesRepository.ts`, `SyncCoordinator.followSessionAndSwitch`, `ui/partials/signInFields.ts`, `viewModel/syncAccountViewModel.ts` (`setSyncEnabled`) |
| Sync — local vs account merge rules | `backend/sync/ProfileMergeEngine.ts` |
| Sync — what to push, deletion order | `backend/sync/ChangeSetBuilder.ts`, `backend/sync/SyncBaselineRepository.ts` |
| Sync — snapshot → local state, id rewriting | `backend/sync/SyncSnapshotMapper.ts`, `backend/sync/LocalIdentifierNormalizer.ts` |
| Sync — push notification that data changed elsewhere | `backend/sync/RefreshChannel.ts` |
| This installation's id and device name | `backend/sync/InstallationIdentity.ts`, `backend/sync/DeviceName.ts`, `backend/sync/DeviceNameReconciler.ts` |
| Sign-in / account section of the menu | `viewModel/syncAccountViewModel.ts`, rendered from `ui/components/workspaceComponent.ts` and `ui/components/firstRunComponent.ts` |
| Service worker entry and its modules | `backend/worker/background.ts`, `backend/worker/module/*` |
| Tab groups, catching links into them | `backend/worker/module/tabGroups.ts`, `backend/worker/module/linkTabGroupCatcher.ts` |
| The bookmarking shortcut - reading it, opening Chrome's shortcuts page | `utils/extensionShortcuts.ts` |
| Bookmark popup | `bookmark.ts`, `bookmark.html`, `backend/worker/module/bookmarkCurrentPage.ts` (right-click submenus, saving from the worker), `backend/worker/module/bookmarkMenuTree.ts` (what the submenu offers), `utils/bookmarkRequest.ts` |
| Favicons — lookup, caching, retrying a miss | `backend/worker/module/favIconWorker.ts`, `backend/repository/FavIconRepository.ts` |
| Favicons — reading a page's `<link rel="icon">` without a DOM | `backend/worker/module/faviconCandidates.ts` |
| Reactive primitive | `utils/observableValue.ts` |
| View-models (one per component or dialog) | `viewModel/*ViewModel.ts`, base `viewModel/abstract/abstractViewModel.ts` |
| Components | `ui/components/*Component.ts`, base `ui/abstract/abstractComponent.ts` |
| Dialogs, menus, bars | `ui/partials/*` — field rules in `ui/partials/fieldValidation.ts` |
| Search bar — engines, the bar, its view model | `backend/entity/SearchEngines.ts`, `ui/partials/searchBar.ts`, `viewModel/searchBarViewModel.ts` |
| The ads bar — an iframe of the website's slot page | `ui/partials/adsBar.ts` |
| Anonymous new-tab counts, batched and reported | `backend/stats/NewTabUsageReporter.ts`, `backend/worker/module/usageStatsWorker.ts` |
| Drag and drop | `ui/dragAndDrop/dragAndDrop.ts` |
| Tips | `ui/tips/tipsCatalogue.ts`, `ui/tips/tips.json` |
| Strings | `i18n/locales/{en,sk}/<area>.json`, loader `i18n/i18n.ts` |
| Manifest, host permissions | `../public/manifest.json` |
| The extension's icon (toolbar, context menu, tab) | `../public/icons/` - rendered from the logo SVG |
| What is behind the page - the corner logo with its FREE/PRO badge, a premium user's own picture | `ui/partials/pageBackground.ts`, `backend/repository/BackgroundImageRepository.ts`, `utils/imageDownscale.ts` |

## Files big enough to read by range

`grep -n` for the function first, then `sed -n 'a,bp'` around it:
`backend/repository/AppStateRepository.ts` (1248), `backend/sync/SyncCoordinator.ts` (~1450),
`ui/components/workspaceComponent.ts` (542), `viewModel/settingsViewModel.ts` (408),
`ui/partials/closedTabsPanel.ts` (405), `backend/sync/ProfileMergeEngine.ts` (398).

## CLAUDE.md, by section

`CLAUDE.md` is long. Implementation work reads Commands, Architecture → Layers, Tech Stack,
Development Rules and whichever feature section it touches. A question reads only the section it
needs — `grep -n '^##' CLAUDE.md` gives the line numbers:

| Section | Needed for |
|---|---|
| Commands | building, testing, what is covered and why |
| Architecture → Layers | any code change |
| Synchronization (`src/backend/sync/`) | anything the backend is involved in |
| Background service worker | tabs, alarms, messages, anything MV3 kills when idle |
| Recently closed tabs, Tips, Dragging, Languages, Dialog constraints, Bookmarking | only when working on that feature |
| Data Model (`AppStateEntity.ts`) | any entity or storage change |
| Development Rules | before writing code |
| Agents & Hooks | before any branch, commit or push |
