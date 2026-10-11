# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Start Vite dev server
npm run build        # Build extension to /dist (unpacked Chrome extension)
npm run preview      # Preview built extension
npm test             # Run the test suite once (Vitest)
npm run test:watch   # Re-run the affected tests as files change
```

Tests run on **Vitest** in a jsdom environment, from **`test/`**, which mirrors `src/`:
`test/backend/sync/ChangeSetBuilder.test.ts` covers `src/backend/sync/ChangeSetBuilder.ts`.
What ships and what proves it are different things, and a bundler told to build `src` should
not have to be told which files in it are not really there. Helpers live in `test/support/`:
`chromeStorageStub.ts` fakes `chrome.storage.local` in memory and is reset before every test,
so repositories are exercised as themselves rather than against a mocked wrapper.

**`src/constants.ts` holds the element, action and class names**, not `main.ts`. The entry
point starts the new tab page, so a component importing a name from it used to pull the whole
bootstrap in - harmless on the page that was going to run it anyway, and in a test a suite that
quietly booted the application against a document with no workspace in it.

What is covered is the synchronisation layer, because that is where a bug costs a user their
links: the merge rules, the change set, identifier rewriting, the profile registry, and first
contact with an account. The UI components are not covered, with two deliberate exceptions:
the field rules in `ui/partials/fieldValidation.ts`, which are the account's constraints
applied early, and `InputDialog` itself, which is where they are wired to a button. jsdom has
no working `<dialog>`, so that test stands `showModal`/`close` in - on the prototype, which is
safe only because vitest gives every test file its own environment.

**A regression test has to fail against the bug it names.** Every test here that claims to pin a
past defect was checked by restoring the old behaviour and watching it fail - two of them passed
against the reverted code on the first attempt and were rewritten. A test that cannot fail is
worse than no test, because it is read as a guarantee.

**Debug logging exists only in development.** `Logger.level` is `import.meta.env.DEV ? DEBUG :
WARN` - every `LOG.debug` shows under `npm run dev` and in the tests, and a `npm run build`
(what goes to the store) keeps warnings and errors only. `vite/client` is in `tsconfig.json`'s
types for that reason.

To load the extension in Chrome: open `chrome://extensions`, enable Developer Mode, click "Load unpacked", select the `/dist` folder.

**One manifest serves Chrome and Firefox.** `background` carries both `service_worker` (Chrome)
and `scripts` (Firefox, which has no extension service workers); each browser ignores the key it
does not use, so neither is redundant. `browser_specific_settings.gecko` holds the Firefox add-on
id - permanent once published - and `strict_min_version` 139, the first Firefox with both
`tabs.group` and `tabGroups`. To check the build against Firefox's own rules:
`npx web-ext lint --source-dir dist` (expected warnings: the Chrome-only `favicon` permission and
the ignored `service_worker`). To load it: `about:debugging` → This Firefox → Load Temporary
Add-on → `dist/manifest.json`. The backend has to allow `moz-extension://*` as an origin, which
its defaults and the cluster's values do.

## Architecture

This is a Chrome Manifest v3 extension that replaces the new tab page. It uses a clean **MVVM + layered architecture**:

```
UI (Web Components) → ViewModel → Repository → Datasource (chrome.storage.local)
                                                     ↕
                         Background Service Worker (background.ts)
```

### Layers

- **`src/ui/components/`** — Native Web Components (no framework). Each component receives a DTO and re-renders on changes. Base class: `AbstractComponent`.
- **`src/viewModel/`** — ViewModels subscribe to `ObservableValue<AppState>` and map entities to DTOs for components. Base class: `AbstractViewModel`.
- **`src/backend/repository/`** — `AppStateRepository` holds all state CRUD. State is immutable (spread-based updates). `FavIconRepository` manages favicon caching.
- **`src/backend/datasource/`** — `ChromeStorageWrapper` persists state to `chrome.storage.local`. `IndexedDB` and `InMemoryGopnikCache` are additional datasource implementations.
- **`src/backend/worker/`** — Background service worker handles async tasks (favicon fetching, opening tab groups). Workers extend `BackgroundWorker` and communicate via `chrome.runtime.sendMessage`.
- **`src/utils/observableValue.ts`** — Custom reactive primitive using `fast-deep-equal` for change detection. Core to the reactive data flow.
- **`src/backend/sync/`** — synchronization with the NewTabLinks backend. See below.

Which file holds which concern, and which section of this file a task needs:

@.claude/CODEMAP.md

### Synchronization (`src/backend/sync/`)

Two-way, and entirely in the page — never the service worker, which MV3 stops after thirty
seconds of quiet. Nothing here blocks the user, and being offline is an ordinary state.

```
SyncCoordinator          orchestrates; everything below is its collaborator
├── SessionRepository    tokens, published so the menu redraws itself
├── BackendApiClient     bearer, 401 -> refresh -> retry once, "offline" as a value not a throw
├── SyncBaselineRepository   what the account is believed to hold, per account
├── ChangeSetBuilder     the difference between that baseline and now = what to push
├── SyncSnapshotMapper   the backend's flat snapshot <-> per-profile ProfileData
├── ProfileMergeEngine   first contact only: joins local data to the account's
├── RefreshChannel       minimal STOMP over WebSocket; no library, no new dependency
└── LocalIdentifierNormalizer   makes identifiers storable, and freshens imported ones
```

Rules that are load-bearing, and easy to break by accident:

- **Push, then pull. Always in that order.** A pull replaces a profile wholesale, so pulling
  first silently discards anything made offline.
- **The baseline only advances when the server confirms.** That is what makes a failed push
  cost nothing: the same difference is simply computed again next time.
- **The baseline is handed back whole, never field by field.** `SyncBaselineRepository.getFor`
  used to rebuild it from the two fields it knew about, so a kind of record added to the
  baseline later was stored and then forgotten on every read - and a baseline that forgets part
  of what the account holds is a device that offers that part again on every synchronisation.
  With a second browser connected, each offer drew a change notification and the two never ran
  out of things to tell each other.
- **Nothing may be transformed between the snapshot and local storage.** A pull replaces local
  state with what the account holds; anything filtered, capped or corrected on the way in is a
  permanent difference, which is the same loop by another road. Trimming belongs where a record
  is written or where it is drawn.
- **`test/backend/sync/syncSettles.test.ts` is the guard for both.** It pushes into a fake
  account, serves the result back, and asserts the second synchronisation has nothing to say.
  Every other sync test asks what one synchronisation sends; this one asks whether they stop.
- **No tombstones, deliberately.** A record absent from the snapshot has been deleted; a record
  absent from local state is a deletion to push. Nothing needs to remember what once existed.
- **Identifiers must be UUIDs.** The backend keys its rows by `uuid`. The seeded profile was
  once literally `"default"` and the example data `"env-1"`, so `LocalIdentifierNormalizer`
  rewrites anything unstorable before the first push. `uid()` mints UUIDv7 - time-ordered, so
  it does not scatter the server's B-tree.
- **The merge matches on the identifier; the name is only a fallback.** Both ends holding a
  record under the same uuid means one record described two ways, and the account's
  description wins. Only a record the account has never heard of is matched by name, which is
  all two devices that have never met can agree on. Matching on the name first was a data-loss
  bug: signing out used to clear the baseline and keep the data, so a device that came back
  still had the account's identifiers, and anything renamed or moved elsewhere meanwhile failed to
  match, took the "carry it over under its own identifier" branch, and overwrote the account's
  record in the merged map - then pushed it as an upsert, which first contact does not withhold.
  Identity is settled for a whole entity kind before any name is compared, so the outcome
  cannot depend on the order records happen to be iterated in.
- **Local data belongs to the account it was synchronised with.** The visible profile set
  (`profile_registry`) carries an `owner`, set when first contact merges it into an account.
  Signing out changes nothing - the links stay visible, stay that account's, and so does its
  baseline, which is now kept per account: signing back in pushes what was done meanwhile,
  deletions included, where a first contact would have withheld them. Another account signing
  in never merges them: `SyncCoordinator.showProfilesOf` hides the set under
  `profile_registry_<ownerId>` and shows that account's own - its hidden set if this browser
  has one, otherwise a single empty placeholder (`awaitingAccount`) that first contact drops
  once the account's profiles are in. Only the registry moves; profile data keys are unique.
  Merging the leftovers of whoever signed out last is what sent one person's links into
  another's account on a shared browser. `push`, `pull` and `mergeWithAccount` each refuse a
  visible set another account owns, and `pull` refuses one nobody owns yet, since it replaces
  local data. The swap runs under a cross-page lock from a registry re-read from storage, and
  every open page reloads when the visible set changes owner (`main.ts`) - a page acting on
  the registry it loaded at startup would merge the old set into the new account.
  While signed out with an owned set, the workspace head shows "Signed out of {username}"
  with a log-in button; a browser whose links belong to no account never shows it.
- **`persisted$`, not `state$`, is what synchronization listens to.** `state$` is for redrawing
  and is deliberately not fired by `saveQuiet()`; subscribing to it would never synchronize a
  collapsed subgroup.
- **Which profile and which workspace are open is per-device and never synchronized.** The data
  under them is shared; the choice is not.
- **A re-established refresh channel is a reason to pull.** A change notification is sent once
  and never replayed, so whatever the account announced while the socket was down - a backend
  pod replaced during a deploy, a laptop asleep - reached nobody. `RefreshChannel.onReconnected`
  fires on every STOMP session after the first (a deliberate `disconnect()` resets that), and
  `SyncCoordinator` schedules a pull on it. The first connection does not count: signing in
  already pulls.
- **Only a definitive refusal of the refresh token ends the session** - 400, 401 or 403. A 5xx
  or 429 on `/refresh` is the server, not the token, and is reported as offline; clearing on it
  signed out everybody whose access token expired while a deploy was rolling out.
- **Every open page shares one refresh token, and it is single use.** `SessionRepository`
  adopts what other pages store (`chrome.storage.onChanged`), and `BackendApiClient` refreshes
  under a lock all pages share (`utils/exclusiveLock.ts`, the Web Locks API), re-reading the
  stored session first: if the refresh token changed, another page already refreshed and its
  pair is used. Two pages spending the same token used to get the second refused, and that
  page cleared the session for all of them.

### Background service worker (`src/backend/worker/`)

Two kinds of thing live there, and they are not the same kind:

- **Request/response modules** extending `BackgroundWorker`, reached from the page through
  `sendToWorkerThread` and routed by `target` in `background.ts`.
- **Event listeners**, registered at the worker's top level. Registration has to happen
  during the worker's own evaluation - that is what Chrome restarts a stopped worker for.
  Anything registered later only runs while the worker is already awake. There are two:
  - `linkTabGroupCatcher` watches `chrome.tabs.onUpdated` and pulls a tab that navigates to
    a link of a subgroup marked `catchLinksIntoTabGroup` into that subgroup's tab group.
  - `bookmarkCurrentPage` watches `chrome.contextMenus.onClicked` for the two right-click
    entries and opens the bookmarking popup on what was clicked. The entries themselves are
    created in `chrome.runtime.onInstalled` - Chrome stores them and brings them back with
    the worker, so creating them on every wake would fail on the identifier already being
    taken. The keyboard shortcut needs no code: `_execute_action` is the browser's own.

MV3 stops the worker after thirty seconds of quiet, so it holds no state between events:
the catcher re-reads the active profile out of `chrome.storage.local` on every navigation,
through the keys in `datasource/chromeStorage/storageKeys.ts` (shared with the repositories,
which is why the background bundle now has an import of its own - both entry points use that
module, and Rollup gives them a shared chunk).

A subgroup's tab group is found by title within one window and created only when absent
(`worker/module/tabGroups.ts`), so opening a whole subgroup and catching its links one at a
time land in the same group. Grouping calls are queued, because two tabs finishing at once
would otherwise each create a group of the same name.

**A subgroup carries the colour its tab group is painted** (`entity/TabGroupColors.ts`), and
there are exactly nine of them because `chrome.tabGroups.update()` takes a name out of its own
list and refuses everything else. A palette of our own - sixteen swatches, a wheel, a hex box,
as TODOS.md originally asked for - could be shown but never applied, so the picker offers what
the browser will honour and says so. A new subgroup is given a colour nothing else in the
profile is using, at random; once all nine are taken, at random among the least used. Changing
one repaints the group already open, in every window, rather than waiting for it to be made
again.

### Bookmarking the current page (`src/bookmark.html`)

The extension's **action popup** - the bubble the browser draws under the toolbar icon - and a
second entry point of its own. It exists because the two halves of the job live in different
places: only the service worker can see the tab the user is looking at, and only a page can
draw a form. Injecting the form into the visited site is what this avoids, and is why the
feature needs no permission beyond `contextMenus`.

- **Three ways in, and only one of them is code here.** The toolbar icon and the keyboard
  shortcut (`_execute_action`, suggested Alt+Shift+D) are opened by the browser itself. The
  right-click entries go through `chrome.action.openPopup()`.
- **The right-click entries are submenus of the open workspace's groups**, and a group with
  subgroups is a submenu of its own, its first entry being the group's root level. The
  workspace's name heads the submenu as a disabled entry, so it says where the groups are
  from. Choosing one
  saves there and then from the worker (`saveInto`, through `AppStateRepository` and
  `BookmarkViewModel.save`, so positions and the links limit are the popup's) and puts a tick
  on the toolbar icon. The popup is the last entry ("Choose a place…") and the fallback for
  any save that cannot happen - a full workspace, a group deleted since the menu was drawn -
  because it can say why. With no group to offer, the entry is a single item opening the popup.
  Chrome has no "menu is about to show" event, so the menu is rebuilt from storage whenever the
  registry, a profile's data or the device preferences change - but only when the tree
  (`bookmarkMenuTree.ts`, pure) differs from the one last drawn, kept in session storage, or
  every collapsed subgroup would rebuild it. The target travels in the entry's identifier,
  since that is all `onClicked` reports to a worker that may have restarted in between.
- **The shortcut cannot be set from here, only read.** Chrome has no `commands.update`, and the
  suggested key applies to fresh installs only. The user can bind anything - Ctrl+D included,
  which then saves into Tabilinks instead of Chrome's bookmarks - on
  `chrome://extensions/shortcuts`. Settings → UI and behavior shows the current binding
  (`chrome.commands.getAll`, re-read when the page regains focus) with a button to that page,
  and so does a tip (`utils/extensionShortcuts.ts`). A chrome:// page opens only through
  `chrome.tabs.create`, never as a link.
- **A popup takes no argument**, so the worker leaves the page to bookmark in
  `chrome.storage.session` and the popup takes it (`utils/bookmarkRequest.ts`). Taken, not
  read, and stamped: a request a dismissed popup left behind is never answered later. A popup
  opened from the toolbar icon finds nothing there, which means "the tab I am standing on"
  and is asked for directly. Only http(s) is offered.
- **Why not a window of its own.** It was one, and a window is a browser window: the browser
  furnishes it with a title bar and, since Chrome 138, the new tab page footer. It also had
  to measure and resize itself, since the subgroup dropdown makes the form's height unknowable
  in advance. A popup has none of that furniture and sizes itself to the document - which is
  why the form is rendered inline (`bookmarkForm.ts`) rather than in a `<dialog>`: a modal
  dialog is out of flow, so the document would measure as empty and the bubble collapse.
  The cost, accepted deliberately: a popup closes when it loses focus.
- The popup starts the repositories and nothing else. **It deliberately does not
  synchronise**: it holds no session and lives for seconds. The link it stores moves the
  stored profile on, and the next new tab page to synchronise pushes that difference, exactly
  as it would for anything made offline.
- **`AppStateRepository` adopts writes made in another page** (`chrome.storage.onChanged`),
  which is what a second page made necessary: without it a new tab page that was already open
  neither shows the new link nor keeps it - its next save puts its own older copy back over
  the stored one. A write the repository made itself is deep-equal to what it holds and is
  ignored, which also stops a pull from being pushed straight back.
- The workspace is a dropdown only when the active profile has more than one, starting on
  the one open on this device; with one it is only named. Choosing a workspace refills the
  groups, and the subgroup dropdown appears only when the chosen group has subgroups. A link
  takes its `environmentId` from its group in `createLink`, never from the open workspace,
  or a link saved into another workspace would claim the wrong one.

### The strip at the bottom of the new tab page is not ours

Chrome 138 added a **footer to the new tab page** which names the extension that overrode it,
next to a "Customize Chrome" button; Brave inherits it and says "Personalize Brave". It is
browser UI drawn below the page's web contents - it has its own scrollbar, which is what makes
it look like a second document - and no manifest key or API removes it from the extension's
side. A user hides it by right-clicking it ("Hide footer on New Tab page") or through Customize
Chrome; a fleet does it with the `NTPFooterExtensionAttributionEnabled` policy.

It appears only on the new tab page, never in the bookmarking window. Anything that looks like
it there is the tab behind that window. Do not go looking for it in this codebase.

### Recently closed tabs (`repository/ClosedTabsRepository.ts`, `worker/module/closedTabsRecorder.ts`)

A rail down the right-hand edge of the new tab page, always present, showing the favicons of
what was closed - and widening into the full list when the pointer reaches it. No click is
needed to look, which is the point: the question it answers is asked in passing.

**It is a column of the page's grid** (`html > body` in main.css), not something laid over the
page. Widening narrows the link columns instead of covering them - a floating panel is one you
cannot drag a link underneath, and one anchored to the top of the window covers the header's
own buttons.

**Opening is decided from the pointer's position, not by `:hover`.** Hover gives up the moment
the pointer crosses onto the scrollbar or the gap beside it, which is exactly where somebody
reaching for the list is about to be. The rule is: at or right of the panel's left edge, *and*
between its top and bottom. It cannot flap, because the edge moves with the panel - closing
puts the edge to the right of the pointer, which is not a reason to open again. The vertical
half is not decoration: the rail is a grid column starting below the header, so "far enough
right" alone is also true of the application menu and the settings button in the corner, and
reaching for those opened the panel underneath them.

**Opening waits; closing does not.** The pointer has to rest in that zone before the panel
widens, because the rail sits under the settings button and a pointer on its way there crossed
it. How long is a device preference (`closedTabsOpenDelay`, 0-1500 ms, 300 by default, a slider
in "UI and behavior"), read each time the pointer arrives so a change needs no reload.
Leaving the page counts as a position too (a `mouseout` with no `relatedTarget`, clamped into
the viewport): in a maximised window the screen's last pixels are the window frame, and a
pointer flung at that edge sent its last mousemove from left of the rail and never reached it. The wait is started once and not restarted by movement within
the rail - a pointer that has stopped sends no more events, so the timer finishes the job.

**The button pins it, and pinning outranks the pointer.** A pinned panel stays open until it is
unpinned, something outside it is clicked, or a row is opened - opening one is the end of the
errand, while deleting or saving one is working through the list and leaves it alone.

- **`chrome.tabs.onRemoved` does not say what was closed** - it carries a tab id, and the tab
  is already gone from the API. So the worker keeps a mirror of the open tabs in
  `chrome.storage.session` (updated on every `onUpdated`) and reads the closure out of it.
  Session storage, not memory: MV3 stops the worker after thirty seconds, and a mirror held in
  memory would forget every tab open longer than that - which is all the interesting ones.
- **They live under a key of their own** (`closed_tabs_<profileId>`), never inside `AppState`.
  The worker writes them, and a worker that had to read-modify-write the whole profile record
  would put back a copy that predates whatever the page saved a moment ago. A key the worker
  owns alone can lose a closed tab at worst; the other arrangement can lose a link.
- **Capped at 500 per profile** (the fair use limit, `FAIR_USE_LIMITS.CLOSED_TAB_HISTORY`; it was 50), deduplicated by address - the same page closed twice is one
  entry moved to the top. Both matter because every entry is pushed to the account: an
  uncapped list would be a browsing history in somebody else's database, growing for ever.
- The page hears about the worker's writes through `chrome.storage.onChanged`, which is what
  makes the panel fill as tabs are closed in other windows.
- A row is marked as already kept by comparing addresses the way `linkTabGroupCatcher` does,
  and names the device that closed it only when that was not this one.
- **The whole row reopens the tab**, not only its text. Folded, the rail draws nothing but the
  favicons, so a row that answered only to its text was a column of icons that did nothing.
  The text stays a button for the keyboard; the "+" and "x" are excluded.
- Saving one as a link reuses `BookmarkForm` in a dialog rather than asking the same question
  a second way.
- **Only synchronised with an account that keeps them.** A snapshot naming no `closedTabs`
  collection at all is not an account with none - it is a backend that has never heard of
  them, and `MappedSnapshot.closedTabsSupported` is the difference. It matters far beyond this
  feature: an operation naming a record kind the server has no vocabulary for cannot be refused
  one at a time, it fails to deserialise and takes the whole request with it. A device sending
  them to an older account had *every* push rejected - links and groups included - and retried
  for ever; with a second browser connected, each rejected push still drew a change
  notification and the two spent the day answering each other. Told nothing about closed tabs,
  a pull also leaves this device's own list alone rather than writing the nothing it was told
  over it.
- **Synchronised, and the first thing that reaches the change set from outside `ProfileData`.**
  `SyncBaseline` and `MappedSnapshot` carry a `closedTabsByProfileId` beside the data, and
  `ChangeSetBuilder.build()` takes it as a fourth argument. A profile being dropped emits no
  closed-tab deletions - the account cascades them, exactly as it does that profile's links.
- **First contact joins the two lists rather than letting one win.** Both are logs of things
  that really happened on machines that have never met, so neither can be discarded; the same
  address closed on both survives once, at the later time. Everywhere else the account wins,
  and that difference is the difference between data and a log.
- **What is pulled is stored exactly as the account holds it.** Nothing is trimmed on the way
  in - not a cap, not a duplicate address, not a clock that reads wrong - because anything this
  device drops is a difference the next change set reports, and reports again on every
  synchronisation, while every report draws a change notification that sets the other connected
  device reporting too. The list is kept in bounds where it is written to (`recordClosedTab`)
  and made readable where it is drawn (`ClosedTabsViewModel.readable`).
- **Titles are cut to 200 characters and over-long addresses are never recorded.** `@Size` is
  validated over the whole push, so one long title is not a rejected row but a 400 for the
  entire batch - and Chrome page titles pass 200 characters daily.
- `closedAt` crosses the wire as an ISO instant, never as epoch milliseconds: the backend reads
  a bare number as epoch *seconds*, which files a tab in the year 58664, silently.
- Nothing schedules a push when a tab closes. Closed tabs ride along with the next
  synchronisation something else causes - which on a new tab page is immediate anyway - so
  closing tabs does not make every other signed-in device re-fetch the account.
- **Recording is a profile setting, `recordClosedTabs`, on by default** (Settings → Privacy).
  Off, the worker records nothing and empties its mirror of open tabs - read from storage on
  every event - and the panel stays, showing a centred notice with a way to Settings → Privacy.
  Turning it off asks first and deletes the list (`SettingsViewModel.toggle`). Another device
  may still push a tab recorded before it heard; the pull stores it as the account holds it,
  and `SyncCoordinator.emptyClosedTabsNotRecorded` deletes it as a write before the next
  change set, so the deletion is pushed and the two settle (`syncSettles.test.ts`).

### Usage statistics and the ad slot (`backend/stats/`, `ui/partials/adsBar.ts`)

- **New tabs are counted anonymously, in daily totals** - a number per local date, never a user,
  an installation id or an address - and sent to `POST /api/v1/stats/new-tabs` with no
  credentials. It has to be disclosed in the store listing and the privacy policy.
- **Counted in the service worker** (`usageStatsWorker`), behind a queue. Two new tab pages
  counting for themselves would each read, add one and write back, losing a count, and could
  both send the same counts.
- **Stored until reported**, by the day they happened. A browser closed early loses nothing: the
  next session's first tab sends it. MV3 has no dependable "browser is closing" moment, so
  nothing tries to use one.
- **The server sets the interval** (`nextReportAfterSeconds`); 15 minutes is the default for a
  device that has not heard it yet. A failed report waits out the interval like a success does,
  or an offline browser would retry on every tab.
- **The ad slot is an iframe of `tabilinks.app/slot/workspace-footer.html`**, so what it shows
  changes without a release and no remote code runs in the extension. It stays hidden until
  the page posts `tabilinks-ad-slot-ready` from the website's origin - `load` also fires for the
  browser's own offline error page.
- **A premium account has no slot at all** - no frame, no reserved space.
  `AccountStandingRepository` reads `premium` from `GET /api/v1/users/me`; the server decides,
  the extension never derives it. It is remembered per account and published before the page
  draws, so no ad flashes on a premium user's tab, and asked again only after 30 minutes or
  after "Upgrade to premium" was clicked. Offline keeps the last answer; signed out, or another
  account, is not premium until asked.

### Tips on the workspace background (`ui/tips/`)

A card at the bottom of the workspace plane, drawn by `TipsBar` into the `<workspace-plane>`
element itself. Inside the scrolling area rather than in the page footer, which is pinned: the
tips belong to the columns screen and move with it, and a line of advice that is always on
screen stops reading as advice and starts reading as furniture. `margin-top: auto` in a plane
that stretches to the height of the scrolling area is what puts it at the foot of the empty
space when there is little to show, and below the columns when there is a lot.

- The tips are **JSON, not code** (`ui/tips/tips.json`), one entry per tip with a sentence per
  language, so adding one is adding an entry and a translator can be handed a file. It is
  imported rather than fetched, so a malformed entry is a build error rather than an empty
  strip on somebody's new tab page. Which language is read comes from `i18n`, not from the
  browser: a reader who chose English on a Slovak browser would otherwise have the whole
  interface in English and the tip at the bottom of it in Slovak.
- An optional `button` on a tip, per language, renames that button for a tip whose link does
  something rather than explains - the Ctrl+D tip opens `chrome://extensions/shortcuts`.
- An optional `url` on a tip draws a "tell me more" button, and is **per language like the
  sentence is**: the tutorial it points at is a page on the website, and that page has a
  language of its own. It falls back to English when a language has no tutorial yet, because
  an untranslated write-up still beats no button. A path is resolved against the website
  (`buildWebsiteUrl`), so the tutorials can move without every tip being rewritten; anything
  with a scheme is taken as it stands.
- A tip is chosen **at random on every page load**, and the arrows step through the rest. The
  position is deliberately not stored: remembering it would mean the same tip every morning,
  and it would make pressing an arrow a write to the profile and so a push to the account.
- **Dismissing is a profile setting** (`hideTips`), not a device one, so it follows the user
  and Settings is the way back - which is what the confirmation says. It is named for hiding
  rather than for showing because a new setting defaults to off, and off has to mean the
  behaviour a profile had before the setting existed.
- **"I know" dismisses one tip**, for good and on every device: its `id` goes into the
  profile's `dismissedTips`, and the view model steps over it. A tip's `id` is therefore a
  stored, synchronised identifier - never rename one, and keep it within `MAX_TIP_ID_LENGTH`.
  The list is pruned (unknown ids, `MAX_DISMISSED_TIPS`) only where "I know" writes it; a pull
  stores it exactly as the account holds it. There is no way back from Settings yet.
- **While a link is being dragged the same bar is the trash.** Turning red under something
  that was already there is what says "this is dangerous now", and a colour cannot transition
  between two elements - so it is one bar with two faces, both built at render, and the
  stylesheet shows one. Which one is keyed off `data-dnd-kind` on the root element, so nothing
  here listens for a drag. It takes a link and nothing else: a subgroup carries its links and
  a group carries both, and one gesture should not be able to destroy that much. The drop is
  not confirmed, exactly as the delete button on a link is not.
- **The bar is drawn for the trash even when tips are hidden**, which is why `hidden` sits on
  the tip face and not on the bar. Keyed on the tip being there, the trash would quietly not
  exist for everyone who has ever pressed "hide tips".
- It is `position: sticky` for as long as the link is in the air. `main` is the scroll
  container and the bar sits under the columns, so with more links than fit down the screen
  the trash would be below the fold - and a bin you have to go and find while carrying
  something is a bin nobody uses.

### Dragging (`ui/dragAndDrop/dragAndDrop.ts`)

HTML5 drag and drop, not pointer arithmetic: the browser already knows how to carry something
under the cursor, draw it while it travels, and tell when a drag was abandoned.

- **Everything is registered, and the setting is read when the drag begins.** Attaching and
  removing listeners as `enableDragAndDrop` changes would mean every component hearing about
  the change and finding its own elements again; refusing a `dragstart` is one comparison in
  one place, and turning the setting on takes effect without anything being rebuilt.
- What is dragged is *named* - `dataTransfer` carries a kind and an identifier - because the
  data a drag carries cannot be read during `dragover`, where every "may this be dropped here"
  decision has to be made. The module keeps the answer.
- **The innermost thing claims the drag, and the innermost target claims the hover.** A link
  sits inside a group and both can be dragged; `dragstart` bubbles, so without
  `stopPropagation` the group's handler ran after the link's and overwrote what was being
  carried - every link drag became a group drag. `dragover` on a reorder target stops for the
  same reason: otherwise a link, its subgroup and its group all light up at once.
- A drop onto a thing means "where this one is": its group, its subgroup, and its place. That
  is how a link crosses into a subgroup or another group without any of it being said
  separately. A drop onto a container - a subgroup's heading, a group's body - means "in here,
  at the end". **The innermost container claims the drop**, or a link dropped on a subgroup's
  heading reaches the group behind it and the outer handler, running last, wins. The heads -
  `link-group-head`, `link-subgroup-head` - are targets in their own right as well: a drop
  there does bubble out to the group or subgroup, but the head is what somebody aims at when
  they mean "this one", and a target that is the thing being aimed at can highlight itself and
  cannot be broken by anything inside it stopping an event on its way out.
- **Nothing inside a draggable element may drag itself.** An anchor drags a URL and an image
  drags a picture, both by default, and one inside a draggable element takes the gesture over -
  a link could only be picked up by the strip its own name and icon did not cover.
  `makeDraggable` clears it on what is there, and elements drawn later say so where they are
  created. The text is `user-select: none` for the same class of reason: a press on selectable
  text starts a selection instead of a drag.
- **The "it goes here" line is a positioned pseudo-element, not an inset shadow.** An inset
  shadow is painted with the element's own background, which is to say underneath everything
  inside it - and what is inside a link is a favicon and a title sitting exactly where the line
  belongs. It straddles the boundary rather than sitting inside the element, because what it
  marks is the seam between two things and not the edge of one.
- **A drop needs `dragenter` and `dragover` both cancelled.** Chrome forgives a missing
  `dragenter` until the drag enters a child the target did not know about, where the
  uncancelled default decides and the drop is refused over that child alone.
- **While a drag is in flight, the insides of a target stop being hit-testable**
  (`html.dnd-active` puts `pointer-events: none` on the children of the heads and of a link).
  This is the answer to "it drops here but not two pixels over": a heading, a description, a
  favicon are all things the pointer can land on, so crossing onto one fires `dragleave` on the
  target beneath and `dragenter` on something that is not a target at all. Out of the pointer's
  way, a head is one target from edge to edge. Only during a drag - the rest of the time those
  are things people click.
- **Space between things is made with `gap` or padding, not with margins on the children** -
  in the heads at least, where things are dropped. A margin belongs to no element: hit-testing
  in that strip finds whatever is behind it, and where a child's margin collapses out of a
  padding-less parent the strip is outside that parent altogether, so there is nothing under
  the cursor for a drop to bubble out of. A gap is inside the box that declares it, so every
  pixel between a heading and its description belongs to the head.
- **A closed tab can be dragged out of the panel and dropped as a new link.** It is the one
  payload that is not already somewhere, so it carries its address and title rather than only
  an identifier: what it makes on the other side is a new link, and nothing in the workspace
  can look a closed tab up - nor should have to reach into the panel to do it. The tab stays in
  the panel afterwards and is marked as kept; it is a record of something that happened, and it
  happened whether or not the page has since been saved.
- **The grab cursor goes only where a click does nothing else.** A link opens and a subgroup's
  heading folds when clicked, so both keep the pointer although they can be dragged, and so does
  a closed tab's row; only a group's heading is grabbed. A cursor that says "grab" over a
  link reads as "this does not open" (`test/ui/styles/dragCursor.test.ts`).
- **Links, subgroups and groups can all be dragged.** A subgroup shares its sequence with the
  group's root-level links, so it can be dropped beside one of them; its own links travel with
  it, because a link names the group it is in as well as the subgroup, and one left behind
  would claim a group that no longer holds its subgroup and be drawn by neither.
- Which half of the element decides before or after: **vertically for a link, horizontally for
  a group**, because groups are columns.
- **The index a drop names counts the sequence as the user sees it**, which still contains the
  thing being dragged. `moveLinkTo` and `moveGroupTo` take one off when the item is moving
  down its own sequence - without that, dropping a link one place to the right moves it two.
  Both renumber from zero rather than nudging, because stored positions are not guaranteed to
  be a clean 0..n-1.

### Languages (`src/i18n/`)

Every sentence the interface says is JSON, one folder per language and one file per screen:
`locales/en/group.json`, `locales/sk/group.json`. The file's name is the first segment of
every key it holds, so `t("subgroup.menu.addLink")` says where its wording lives. What several
screens say in the same words goes to the file named after the thing rather than into each of
them - `common` for the buttons every dialog has, `dialogs` for the input dialog and its
validation, `errors` for the account, `dates` for anything about time.

- **Imported, not fetched**, like the tips already were. A malformed file is a build error
  rather than an empty page, both languages are in the bundle, and - the reason that matters -
  `t()` answers synchronously. Rendering here is not asynchronous; a translator that had to be
  awaited would mean either a page drawn in keys and corrected afterwards, or every render
  turning into a promise.
- **The language is settled before anything is drawn**, in `applyLocale()` beside
  `applyScale()`, from the device preferences both entry points already await. Every string is
  read once, as its element is built.
- **Plurals go through `Intl.PluralRules`**, never `count === 1`: that comparison is an English
  rule wearing the clothes of a universal one. English needs "an hour ago" where it would
  otherwise say "1 hours ago", and Slovak wants a different word for two, three and four than
  for five. A plural entry is an object carrying `other` and whichever other categories the
  language uses, and `other` is what tells it apart from a branch of the tree.
- **A missing key returns the key**, visible and greppable. It costs one ugly label, never the
  screen it was on, and `test/i18n/catalogue.test.ts` is what notices a gap before a reader
  does - including a translation that drops a `{placeholder}` or invents one.
- **Language and date format are device preferences**, beside the size slider and for the same
  reason (`DevicePreferencesRepository`). A language looks at first like something that follows
  the person; it does not - one person's two browsers are routinely set to two languages. The
  practical half agrees: `ProfileSettings` is booleans on the profile record, and a string there
  would be a backend column, a snapshot field and a merge rule for a choice the account has no
  opinion about.
- **The date format is a separate question from the language**, which is why there are two
  settings. The language picks the words; the format picks the order the parts of a date go in.
  "Local custom" - the default - takes that order from the browser's own region, which is also
  why `currentLocaleTag()` keeps the browser's full tag when its base is the language being
  spoken and drops it when the user has chosen something else.
- **Changing the language reloads the page.** It is the only honest way to redraw an interface
  whose every string was read while it was being built. The settings dialog leaves a note in
  session storage and `main.ts` opens it again, so setting a language and then a date format is
  one journey through the menu.
- **`InputDialog` fields declare the key their value reaches the callback under.** It used to
  be the label, camel-cased - fine with one wording per field, a bug with two: a Slovak dialog
  would hand `addWorkspace` a `nazovPracovnehoPriestoru`. The camel-cased fallback is kept for
  callers with nothing to translate, which is what the tests are.
- **The service worker translates its two right-click entries too**, which costs it a read of
  the device preferences (it inherits nothing) and a rebuild when they change - Chrome keeps a
  context menu entry until it is told otherwise.
- **`public/_locales/` is a second, separate mechanism and that is correct.** It translates
  what our runtime cannot reach: the extension's name and description, the toolbar tooltip, and
  the keyboard shortcut's description on chrome://extensions/shortcuts. Those follow the
  *browser's* language rather than this setting, because that is the only thing Chrome will
  read them by.
- **The automatic device label is deliberately not translated** (`sync/DeviceName.ts`). It is
  an identifier: stored on the account, shown on devices reading in another language, and
  compared as a string against what the worker stamped. Translating it would rename a device
  whenever its owner changed language and make "was this closed elsewhere" answer yes on the
  device it happened on.

### Limits and slots (`entity/PlanLimits.ts`, `sync/SyncSlots.ts`)

The owner's design is `new-tab-links-frontend/.claude/assignments/account-limits-handling.md`.

- **One table of numbers** (`PlanLimits.ts`): free 1 profile, 2 workspaces per profile, 25
  closed tabs, 5 installations; premium (Fair Use) 50 / 50 / 500 / 100; every plan 25 groups per
  workspace, 25 subgroups per group, 500 links per workspace. Names are the backend's `limit`
  values. **The compiled numbers are only the signed-out default** - the account sends its
  effective limits (`GET /users/me/plan-limits`, `planLimits` on the snapshot), published as
  `planLimits$`; the worker reads them from storage (`readStoredPlanLimits`).
- **Only growth is refused, nothing is ever deleted, hidden or locked.** Every adding door checks
  (`AppStateRepository.refused` / `roomForLinks`, `ProfileRepository.createProfile`, imports whole).
  A refusal's `kind` decides the notice: `FREE_PLAN` offers the upgrade (or, signed out, log in /
  create an account); `FAIR_USE` links to `/fair-use`. The closed tabs history rolls - a list
  longer than the cap loses one entry per new one, never all at once.
- **Slots decide what synchronises, on this side** (`decideSyncScope`): the account's first N by
  its `createdAt`, ties broken by id as lower-case text (the backend's uuid order; every row of
  one push shares a timestamp), hold slots, what this device brings takes what is left; example data and a
  workspace over a Fair Use cap never synchronise; never half a workspace. Before a push the
  account's lists (`GET /profiles`, `GET /environments`) are read; a 409 re-reads them and
  pushes once more without what lost - no loop.
- **Push and pull are confined to the scope** (`ScopedSync.ts`). The baseline keeps out-of-scope
  items at their last synchronised state. **The pull deletes a local profile or workspace only
  when the baseline says the account held it** (deleted elsewhere) or the server remapped it;
  anything else absent from the snapshot is local only and stays. Records *inside* a
  synchronised workspace are still replaced by the account's copy.
- **Name matching only at first contact** - at sign-in, and in steady state only for what is
  local only for lack of a slot or over a cap (`adoptNameMatches`), so renaming such an item to
  the account's name merges it. Something new that fits a free slot syncs as a new item even
  when it shares a name - it is never swallowed into the existing one. A merge that would
  go over a Fair Use cap keeps that workspace apart, local only (`CappedMerge.ts`, `heldApart$`).
- **Example data** (`ExampleData.ts`): a fingerprint on each example workspace, cleared for good
  by the first save that changes it; never synchronised; removed at sign-in if untouched.
- Deleting here is sent for anything the account accepts a deletion of: any of its profiles, and
  any workspace under a slot-holding profile, slot or not (edits to slot-less ones are refused).
- A refresh answered 409 `DEVICES` (premium ended, installation beyond the free number) ends the
  session with the device-limit dialog and the body's `manageUrl` (`SessionRepository.revoked$`).
- After each cycle the installation reports its inventory (names and counts only) when it changed.

### Dialog constraints (`ui/partials/fieldValidation.ts`)

Every creation and rename goes through `InputDialog`, and each of its fields may declare
constraints - `{ type, required, maxLength, key }` - beside the bare type it used to take. The
dialog will not submit a form that breaks them: the confirming button is disabled, the offending
field is named under itself, and Enter refuses too (a disabled button does not stop a keypress).

**The limits are the backend's, and they are enforced here for a specific reason.** `@Size` is
validated over the whole push request, so one over-long name does not come back as one rejected
operation - it fails the entire batch with a 400, nothing is applied, and it then sits in local
state stopping every other change from reaching the account until somebody finds it. The
numbers live in `SyncContracts` beside the rest of the wire contract: `MAX_NAME_LENGTH` 120,
`MAX_DESCRIPTION_LENGTH` 500, `MAX_TITLE_LENGTH` 200, `MAX_URL_LENGTH` 2048.

A URL field also refuses `javascript:`, `data:`, `vbscript:` and `blob:`. A link is drawn as an
anchor on the new tab page, which is an extension page, so a `javascript:` href clicked there
runs with that page behind it. Any other scheme is allowed, `file:` and `mailto:` included, and
a host is demanded only of http(s).

The view models still refuse invalid input, but only as backstops for callers that are not a
dialog: they log and return rather than telling the user, because the dialog is what tells the
user now.

**No `alert()`, `confirm()` or `prompt()`.** The browser draws those in its own style and
titles them with the extension's address. `ui/partials/confirmations.ts` has the page's own:
`showNotice` for telling, `confirmDestructiveAction` for a yes/no (a dangerous `OptionsMenu`
item goes through it, named by the item's own title), `confirmByTypingPhrase` for the
irreversible, and `InputDialog` for asking for a value. `test/ui/partials/optionsMenu.test.ts`
fails if the menu reaches for `confirm()` again.

### Data Model (`AppStateEntity.ts`)

```
Profile (registry in ProfileRepository, data stored per profile)
└── AppState / ProfileData
    ├── environments: Record<string, Environment>   ← "workspaces"
    ├── groups: Record<string, Group>               ← belong to an Environment
    ├── subgroups: Record<string, Subgroup>         ← belong to a Group, collapsible
    └── links: Record<string, Link>                 ← belong to Group, optionally Subgroup
```

**Not every setting is the profile's.** `DevicePreferencesRepository` holds the ones that
belong to the browser in front of you - the size the interface is drawn at, so far - under a
key of their own, never synchronised and never on the profile record. A 27-inch desktop and a
13-inch laptop want different answers to "how big", and one dictating the other is worse than
neither knowing; it is the same reasoning that keeps the open workspace per-device. The size is
a root font size, because everything here is sized in em, and it is applied before the page
draws anything so that a resized interface does not jump a size once storage answers.

A profile also carries **settings** (`entity/ProfileSettings.ts`): what that profile is set to
do, as opposed to what it holds. They live on the profile record rather than in a store of
their own, which is what lets them synchronise with no new entity kind, no snapshot collection
and no merge rules - a settings change is simply a difference in the profile upsert the change
set already sends, and `profiles$` firing is what schedules it. The price, paid knowingly: two
profiles are two sets of preferences. Every setting is a boolean defaulting to off - except
`dismissedTips`, a list defaulting to empty, which `ToggleableSetting` leaves out of the
settings dialog - and is read through `settingsOf()`, never straight off the profile: a
profile stored before a setting existed says nothing about it, and so does an account whose backend does not know it yet, and
both have to read as the default rather than as `undefined` - the two compare differently, and
the difference would be pushed.

**`enableDragAndDrop` and `recordClosedTabs` are the exceptions: they default to on.**
`enableDragAndDrop` was added off, while the dragging did not exist; now dragging is how the page is used and off is the opt-out. Renaming
it to a "disable" setting would have kept the rule at the price of a backend column. What the
flip costs: a profile that never said anything reads as on, while one ever pulled from an
account has the account's value written out and keeps it. A snapshot that omits the field is
mapped to `DEFAULT_PROFILE_SETTINGS`, never to a literal `false`. `recordClosedTabs` defaults
to on for the same reason - recording is what every profile did before it existed - and the
backend reads an absent value as "keep what is stored" (on for a new profile) rather than as
`false`, unlike every other flag there, so an extension too old to send it cannot stop
recording. A new setting still defaults to off.

The backend mirrors this exactly, profiles included. **A new field on an entity has to be
threaded through five places** or it is silently lost: the entity here, `SyncContracts`
(both `SyncOperation` and the snapshot DTO), `ChangeSetBuilder` (or it is never pushed),
`SyncSnapshotMapper` (or every pull wipes it), and the backend itself. A field deliberately
left out of `ChangeSetBuilder` stays device-local and cannot by itself cause a push - the
comparison is on the operation that would be sent, not on the stored record.

All entities use string UUIDs as keys. Links have a `position` field for ordering.

**Root-level links and subgroups of a group share one `position` sequence.** A link that is
not in a subgroup is ordered against that group's subgroups, not only against its sibling
links - which is how the group view model renders them. Anything that inserts into or reorders
that sequence has to count both kinds; counting only links is what let a link step through a
subgroup and land on its position. Links inside a subgroup are their own sequence.
Reordering renumbers the whole scope from index 0 rather than adding one to a position,
because stored data is not guaranteed to be a clean `0..n-1`: subgroups were once created at
position 0 whatever the group already held.

### UI Component Hierarchy

```
<workspace-plane>         (WorkspaceComponent)
  <link-group>            (GroupComponent)
    <link-container>      (LinkComponent, direct links)
    <link-subgroup>       (SubgroupComponent)
      <link-container>    (LinkComponent, links in subgroup)
```

### Key Constants

Defined in `src/constants.ts`: custom element tag names, action classes and plain class names. The elements themselves are registered in `src/main.ts`, which is the entry point and nothing else.

## Tech Stack

- **TypeScript** 5.9.3 (strict mode), targeting ES2020
- **Vite** 7.3.1 — three entry points: `src/main.ts` (new tab page), `src/bookmark.ts`
  (the bookmarking popup) and `src/backend/worker/background.ts` (service worker)
- **Web Components** — no UI framework; components use native `customElements.define`
- **CSS** — plain CSS with variables in `src/ui/styles/__variables.css`; each component has its own stylesheet
- **`fast-deep-equal`** — sole runtime dependency, used by `ObservableValue`

## Development Rules

### General
- Do not introduce new dependencies unless necessary
- Follow existing project structure
- Keep Chrome Extension Manifest V3 compatibility
- Update this file if new recurring rules or context emerge

### Scope
- Prefer small, incremental changes over large refactors
- Modify only files relevant to the task
- Ask before making significant architectural changes
- For complex tasks, propose step-by-step approach first

### Code Style
- Use TypeScript only (no plain JavaScript)
- Ensure full typing where reasonable
- Prioritize readability and maintainability over brevity
- Avoid overly long functions/classes → split into smaller units when needed
- Use descriptive names (no vague variables like `a`, `b`)
- Add comments/JSDoc for non-obvious logic

### Decision Making
- Follow existing patterns in the codebase
- Prefer simple solutions over complex ones
- Avoid over-engineering

### Output
- Show only relevant code changes (diffs or snippets)
- Do not repeat unchanged code
- Clearly indicate where changes apply

### Workflow
- After completing each set of changes, run `npm run build` to build the extension so I can test it in the browser.

## Agents & Hooks

- **`backend-sync` agent** (`.claude/agents/backend-sync.md`) — for the planned sync backend:
  impact analysis of backend/data-model changes on the extension, and implementing them here.
  Invoke it for anything touching sync, the storage contract, or work that must stay in step
  with the backend repository.
- **Sibling repositories**, each reached through a **user-level** agent in `~/.claude/agents/`,
  because a project-scoped agent is invisible from another checkout. Each points at that repo's
  own agent file, resolves its own checkout, and never edits this one.

  | Send it to | Agent | Local path |
  |---|---|---|
  | the backend (Spring Boot) | **`backend-developer`** | `/home/kovo/IdeaProjects/new-tab-links-backend` |
  | the website (Angular) | **`frontend-developer`** | `/home/kovo/IdeaProjects/new-tab-links-frontend` |
  | the cluster (GitOps) | **`devops-engineer`** | `/home/kovo/IdeaProjects/kovostack-infra-gitops` |

  This extension has one too — **`extension-developer`** — which is how the other three reach it;
  it points at `backend-sync.md` above and covers the whole repo, not only sync work. The backend
  remote is `git@github.com:Kovospace/new-tab-links-backend.git`.
- **Sibling access is this session's, not the agent's.** A subagent runs inside the session that
  starts it and inherits its permissions; its agent file says where to look, the permissions
  decide whether it may. The gitignored `.claude/settings.local.json` lists all three checkouts
  under `permissions.additionalDirectories`. It is local and so not in a fresh clone: without it
  every read outside this repo is refused (`blockReadsOutsideWorkingDirectories`) and the
  sibling agents cannot see their own repos. Directories are fixed when a session starts - a new
  file takes effect on the next session, or through `/add-dir` in this one.
- **The backend and the website can be changed from here; the cluster cannot.** Only
  `kovostack-infra-gitops` keeps a deny rule (`Edit(//home/kovo/IdeaProjects/kovostack-infra-gitops/**)`),
  because a merge there is a deploy. The backend and frontend used to be denied too, which only
  meant a change spanning two repos had to be written up here and pasted into a second session.
  A deny rule stops Claude's file tools, not a shell command, so it is never to be worked around.
- **Working in a sibling from here, its own rules have to be read by hand.** This session loaded
  this repo's CLAUDE.md, skills and hooks - not the sibling's. Before changing one: read its
  CLAUDE.md, read any skill it names as required (`<repo>/.claude/skills/<name>/SKILL.md`; they
  are not registered here), and follow its git rules, since its `PreToolUse` hooks do not fire
  (`$CLAUDE_PROJECT_DIR` is this repo). The backend, for one, commits only when asked, builds
  with `JAVA_HOME=$HOME/.jdks/openjdk-26.0.2 ./mvnw`, and requires `java-code-standards` and
  `authentication` before security work. Branch it off its own `main`, and keep the branch name
  in step with this repo's when the change spans both.
- **mirrord does not apply here.** The other two repos use it to run a local process inside the
  cluster; this extension runs inside Chrome, which mirrord cannot reach. To develop against real
  data, run the backend under mirrord (`new-tab-links-backend/.mirrord/README.md`) and point this
  extension at `http://localhost:8080`, adding that origin to the manifest's host permissions —
  or call the public API directly, since the deployed backend already allows
  `chrome-extension://*` as a CORS origin.
- **Branch policy** — pushes go to `feature/**` or `bugfix/**` branches only, named to match the
  corresponding backend-repo branch; `main`/`master` are reached through PRs only. A `PreToolUse`
  hook (`.claude/hooks/block-push-to-main.sh`, wired in `.claude/settings.json`) denies any
  `git push` whose destination is `main` or `master`.
