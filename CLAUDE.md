# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Start Vite dev server
npm run build        # Build extension to /dist (unpacked Chrome extension)
npm run preview      # Preview built extension
```

No test suite exists yet (`npm test` exits with error by design).

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

### Data Model (`AppStateEntity.ts`)

```
AppState
├── environments: Record<string, Environment>   ← "workspaces"
├── groups: Record<string, Group>               ← belong to an Environment
├── subgroups: Record<string, Subgroup>         ← belong to a Group, collapsible
└── links: Record<string, Link>                 ← belong to Group, optionally Subgroup
```

All entities use string UUIDs as keys. Links have a `position` field for ordering.

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
