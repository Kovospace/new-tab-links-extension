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