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
contact with an account. The UI components are not covered.

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
- **Event listeners**, registered at the worker's top level. `linkTabGroupCatcher` is the
  first: it watches `chrome.tabs.onUpdated` and pulls a tab that navigates to a link of a
  subgroup marked `catchLinksIntoTabGroup` into that subgroup's tab group. Registration has
  to happen during the worker's own evaluation - that is what Chrome restarts a stopped
  worker for. Anything registered later only runs while the worker is already awake.

MV3 stops the worker after thirty seconds of quiet, so it holds no state between events:
the catcher re-reads the active profile out of `chrome.storage.local` on every navigation,
through the keys in `datasource/chromeStorage/storageKeys.ts` (shared with the repositories,
which is why the background bundle now has an import of its own - both entry points use that
module, and Rollup gives them a shared chunk).

A subgroup's tab group is found by title within one window and created only when absent
(`worker/module/tabGroups.ts`), so opening a whole subgroup and catching its links one at a
time land in the same group. Grouping calls are queued, because two tabs finishing at once
would otherwise each create a group of the same name.

### Data Model (`AppStateEntity.ts`)

```
Profile (registry in ProfileRepository, data stored per profile)
└── AppState / ProfileData
    ├── environments: Record<string, Environment>   ← "workspaces"
    ├── groups: Record<string, Group>               ← belong to an Environment
    ├── subgroups: Record<string, Subgroup>         ← belong to a Group, collapsible
    └── links: Record<string, Link>                 ← belong to Group, optionally Subgroup
```

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
- **Vite** 7.3.1 — two entry points: `src/main.ts` (UI) and `src/backend/worker/background.ts` (service worker)
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
