# Screenshot catalogue

What can be rendered, where it is kept, and where it is used. Read by the `screenshot-maker`
agent (`.claude/agents/screenshot-maker.md`) before every job; **a new scene adds a row here**.

## Where pictures are kept

```
screenshots/versions/<version>/<target>/<language>/<name>.png
```

- `<version>` is `public/manifest.json`'s `version` at the time of rendering. Rendering again
  before a release overwrites that version's pictures; older versions stay, for documenting an
  older release. **The website publishes only the newest version** - Chrome and Firefox update
  extensions on their own, within hours to a day or two for nearly everybody.
- `<target>` is the scene file: `store.shots.ts` renders `store`.
- Committed. A version folder is a record; never edit an old one by hand.
- `screenshots/out/` holds only what a failed run leaves behind (trace, screenshot) - not committed.

## Running

```bash
npx playwright install chromium        # once per machine
npm run screenshots                    # build, then every target, every language
npm run screenshots -- store           # build, then one target (a file-name filter)
npx playwright test -c screenshots store -g "home" --project=sk   # one scene, one language, no build
npx playwright test -c screenshots --ui                         # watch it step by step
```

## Targets

Status: **ready** = scenes exist and render; **planned** = asked for, no scenes yet.

| Target | Status | Size, density | Used by | Notes |
|---|---|---|---|---|
| `store` | ready (3 of 5) | 1280×800, 1× | Chrome Web Store listing, copied by hand into `store/materials/screenshots/<lang>/` | Order and content: `store/chrome-web-store-listing.md`, "Suggested screenshots". #4 (right-click submenu) cannot be rendered - browser UI. |
| `tips` | planned | 3× | website `public/images/<lang>/tips/<slug>/<name>_3x.png` | One folder per tip slug; names follow what is there now. `image-maintainer` derives `_2x`/`_1x` from `_3x` and converts to WebP. |
| `demo` | planned | 3× | website `public/images/<lang>/demo/<n>_3x.png` | Numbered. |
| `theme-showcase` | planned | 3× | website `public/images/<lang>/theme-showcase/<n>-<dark\|light>_3x.png` | Same scene in each theme: `test.use({ preferences: { theme } })`. |
| `home-features` | planned | 3× | website `public/images/<lang>/home-features/<feature>/` | One folder per feature section. |
| `install` | planned | 3× | website `public/images/<lang>/install/` | Sign-in forms and the account menu. |
| `tour` | planned | - | website tour page | Uses no pictures yet. |

A website target renders at 3× (`test.use({ deviceScaleFactor: 3 })` at the top of its file) and
names each picture `<name>_3x`: the website derives the smaller densities itself.

## Scenes

| Target | Scene (`test` title) | Picture | What it shows |
|---|---|---|---|
| `store` | light theme › home | `1-home` | The example workspace, light, Aero, background 3 |
| `store` | search suggestions | `2-search` | "you" typed, links suggested above "search the web" |
| `store` | light theme › settings, background | `5-settings-background` | Settings → Background, light |

## What every scene starts from (`support/stage.ts`)

"Load examples", then made to look used before the first picture:

- **Not example data** - the example mark is cleared as a first edit would, so no "only an example" notice.
- **History and closed tabs** - history recording on; four pages really visited and closed
  (`VISITED_PAGES`, per language), then two more from "Work computer" / "Pracovný počítač"
  (`OTHER_DEVICE_PAGES`), all moved to just before the frozen clock.
- **Premium, no ad slot** - a stored session with a premium standing and synchronisation off, so
  nothing asks the account. Only `api.tabilinks.app` is blocked; the website is reachable, for the
  full-size background pictures.

## Page actions (`support/newTabPage.ts`)

| Method | Does |
|---|---|
| `pointerAway()` | Moves the pointer where it opens nothing |
| `openSettings(category?)` | Application menu → Settings, that category alone unfolded and at the top |
| `search(query)` | Types into the search bar, waits for suggestions |
| `chooseBackground(number)` | Settings → Background → that built-in tile, waits for the picture, closes Settings |

## Not yet possible

- **Browser UI** - the right-click submenu, tab groups in the tab strip, the popup's bubble.
  Headless Chromium draws the page only.
