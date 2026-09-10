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

Tests run on **Vitest** in a jsdom environment, from `src/**/*.test.ts` beside the code they
cover. `src/test/chromeStorageStub.ts` fakes `chrome.storage.local` in memory and is reset before
every test, so repositories are exercised as themselves rather than against a mocked wrapper.

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

To load the extension in Chrome: open `chrome://extensions`, enable Developer Mode, click "Load unpacked", select the `/dist` folder.

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
  bug: signing out clears the baseline and keeps the data, so a device that comes back still
  has the account's identifiers, and anything renamed or moved elsewhere meanwhile failed to
  match, took the "carry it over under its own identifier" branch, and overwrote the account's
  record in the merged map - then pushed it as an upsert, which first contact does not withhold.
  Identity is settled for a whole entity kind before any name is compared, so the outcome
  cannot depend on the order records happen to be iterated in.
- **`persisted$`, not `state$`, is what synchronization listens to.** `state$` is for redrawing
  and is deliberately not fired by `saveQuiet()`; subscribing to it would never synchronize a
  collapsed subgroup.
- **Which profile and which workspace are open is per-device and never synchronized.** The data
  under them is shared; the choice is not.

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
- Which workspace the link goes into is not asked: it is the one open on this device. The
  group is chosen, and the subgroup dropdown appears only when that group has subgroups.

### The strip at the bottom of the new tab page is not ours

Chrome 138 added a **footer to the new tab page** which names the extension that overrode it,
next to a "Customize Chrome" button; Brave inherits it and says "Personalize Brave". It is
browser UI drawn below the page's web contents - it has its own scrollbar, which is what makes
it look like a second document - and no manifest key or API removes it from the extension's
side. A user hides it by right-clicking it ("Hide footer on New Tab page") or through Customize
Chrome; a fleet does it with the `NTPFooterExtensionAttributionEnabled` policy.

It appears only on the new tab page, never in the bookmarking window. Anything that looks like
it there is the tab behind that window. Do not go looking for it in this codebase.

### Tips on the workspace background (`ui/tips/`)

One dimmed sentence along the bottom of the workspace, in the page footer - which held an
empty span before this. The footer rather than the columns themselves on purpose: a tip drawn
behind the columns is unreadable as soon as somebody has enough of them, and one drawn over
them is in the way.

- The tips are **JSON, not code** (`ui/tips/tips.json`), one entry per tip with a sentence per
  language, so adding one is adding an entry and a translator can be handed a file. It is
  imported rather than fetched, so a malformed entry is a build error rather than an empty
  strip on somebody's new tab page.
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
  rather than for showing because every setting defaults to off, and off has to mean the
  behaviour a profile had before the setting existed.

### Dialog constraints (`ui/partials/fieldValidation.ts`)

Every creation and rename goes through `InputDialog`, and each of its fields may declare
constraints - `{ type, required, maxLength }` - beside the bare type it used to take. The
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

### Data Model (`AppStateEntity.ts`)

```
Profile (registry in ProfileRepository, data stored per profile)
└── AppState / ProfileData
    ├── environments: Record<string, Environment>   ← "workspaces"
    ├── groups: Record<string, Group>               ← belong to an Environment
    ├── subgroups: Record<string, Subgroup>         ← belong to a Group, collapsible
    └── links: Record<string, Link>                 ← belong to Group, optionally Subgroup
```

A profile also carries **settings** (`entity/ProfileSettings.ts`): what that profile is set to
do, as opposed to what it holds. They live on the profile record rather than in a store of
their own, which is what lets them synchronise with no new entity kind, no snapshot collection
and no merge rules - a settings change is simply a difference in the profile upsert the change
set already sends, and `profiles$` firing is what schedules it. The price, paid knowingly: two
profiles are two sets of preferences. Every setting is a boolean defaulting to off and is read
through `settingsOf()`, never straight off the profile: a profile stored before a setting
existed says nothing about it, and so does an account whose backend does not know it yet, and
both have to read as the default rather than as `undefined` - the two compare differently, and
the difference would be pushed.

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

Defined in `src/main.ts`: custom element tag names and worker message type constants. All custom elements are registered there.

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
  remote is `git@github.com:Kovospace/new-tab-links-backend.git`; all three are reachable from
  sessions here via `permissions.additionalDirectories` in the gitignored
  `.claude/settings.local.json`.
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
