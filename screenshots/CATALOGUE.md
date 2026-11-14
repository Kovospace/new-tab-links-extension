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
- A picture name may carry a folder: `tips` keeps one per tip slug,
  `versions/<version>/tips/<language>/<slug>/<name>_3x.png` - the website's own layout.
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
| `store` | ready (6 pictures; the store takes 5) | 1280×800, 1× | Chrome Web Store listing, copied by hand into `store/materials/screenshots/<lang>/` | Order and content: `store/chrome-web-store-listing.md`, "Suggested screenshots". #4 (right-click submenu) cannot be rendered - browser UI. |
| `tips` | every tip the website has (14) | 1280×800, 3× | website `public/images/<lang>/tips/<slug>/<name>_3x.png` | One `test.describe` and one folder per tip slug; names follow what is there now. `image-maintainer` derives `_2x`/`_1x` from `_3x` and converts to WebP. |
| `demo` | planned | 3× | website `public/images/<lang>/demo/<n>_3x.png` | Numbered. |
| `theme-showcase` | ready (6 pairs) | 1280×800, 3× | website `public/images/<lang>/theme-showcase/<n>-<dark\|light>_3x.png` | Every scene rendered once per theme (`for (const theme of ["light", "dark"])`), so a pair differs in the theme alone - the home page lays the dark one over the light one and clips it. |
| `home-features` | planned | 3× | website `public/images/<lang>/home-features/<feature>/` | One folder per feature section. |
| `install` | planned | 3× | website `public/images/<lang>/install/` | Sign-in forms and the account menu. |
| `tour` | planned | - | website tour page | Uses no pictures yet. |

`shootThemeSplit(name, splitAt?)` (a fixture beside `shoot`) saves one picture light left of a
vertical seam and dark right of it - both rendered from the same page, joined on a canvas.

A website target renders at 3× (`test.use({ deviceScaleFactor: 3 })` at the top of its file) and
names each picture `<name>_3x`: the website derives the smaller densities itself.

## Scenes

| Target | Scene (`test` title) | Picture | What it shows |
|---|---|---|---|
| `store` | light theme › home | `1-home` | The example workspace, light, Aero, background 3 |
| `store` | light theme › recently closed › side panel, a row hovered | `2-recently-closed` | Light, background 3: the side panel open on Recently closed, the work computer's row hovered, pointer drawn |
| `store` | light theme › search suggestions | `3-search` | Light, background 3: "music" typed - links, a history entry (hovered, pointer drawn), "search the web" |
| `store` | dark theme › subgroup menu | `4-subgroup-menu` | Dark, Aero, background 12: the Directories subgroup's menu, "Edit subgroup title & description" hovered, pointer drawn |
| `store` | dark theme › flat › link context menu | `5-link-context-menu` | Dark, flat, background 12: Brave Search right-clicked, "Edit link" hovered, pointer drawn |
| `store` | light theme › settings, background | `6-settings-background` | Settings → Background, light |
| `tips` | change-background › settings, choosing a built-in picture | `change-background/pozadie_nastavenia_3x` | Dark, background 6: Settings → Background, tile 6 hovered, pointer drawn |
| `tips` | change-background › settings, the user's own picture | `change-background/pozadie_vlastne_3x` | Dark: `support/assets/own-background.jpg` added with "+", its tile (first) hovered, the picture behind |
| `tips` | change-background › home | `change-background/pozadie_priklad_3x` | Dark, background 6: the example workspace - as theme-showcase `1-dark` |
| `tips` | choose-theme › flat › home, light and dark | `choose-theme/1_3x` | Flat, background 6: light left of the seam, dark right of it; the seam through the middle of the group columns |
| `tips` | choose-theme › aero › home, light and dark | `choose-theme/2_3x` | As above, Aero |
| `tips` | discover-history › side panel folded, framed | `discover-history/panel-zrolovany_3x` | Dark, background 6, card History: the folded rail in a red frame |
| `tips` | discover-history › side panel open | `discover-history/panel-otvoreny_3x` | As above, the panel open on History, no row hovered |
| `tips` | discover-history › history entries, one from another device hovered | `discover-history/panel-pridat-link_3x` | Close-up (clip) of three history rows, the middle one - Stack Overflow, "Work computer" - hovered with its buttons, pointer drawn |
| `tips` | discover-profiles › home, the profile button framed | `discover-profiles/profil-lokacia_3x` | Dark, background 6, two more profiles (Work/Home, sk Práca/Doma): the page with the "Profile:" button in a thick red frame |
| `tips` | discover-profiles › the profile button, close | `discover-profiles/profil_3x` | Close-up (clip) of the header around the "Profile:" button |
| `tips` | discover-profiles › the profiles menu | `discover-profiles/profil-menu_3x` | Close-up of the open profiles menu with its button: Work, Home, Default (current) and the export/import/create/manage entries |
| `tips` | discover-profiles › the profile manager | `discover-profiles/profil-manage_3x` | Close-up of the Manage profiles dialog: Work 5 workspaces/64 links, Home 4/37, Default (current) |
| `tips` | discover-workspaces › home, the workspace switcher framed | `discover-workspaces/pracovne-plochy-lokacia_3x` | Dark, background 6, three more workspaces (Garage/Music/Development, sk Garáž/Hudba/Vývoj) after Examples: the page with the switcher and its "+" in a thick red frame |
| `tips` | discover-workspaces › the workspace switcher, close | `discover-workspaces/pracovne-plochy_3x` | Close-up (clip) of the switcher with its "+" and the open workspace's heading and "+ Add group" under it |
| `tips` | use-searchbar › home, the search bar framed | `use-searchbar/searchbar-location_3x` | Dark, background 6: the page with the search bar (engine button, field, submit) in a thick red frame |
| `tips` | use-searchbar › the search bar, close | `use-searchbar/searchbar-detail_3x` | Close-up (clip) of the search bar |
| `tips` | use-searchbar › suggestions, a group's links first | `use-searchbar/searchbar-suggestions_3x`, `use-searchbar/searchbar-suggestions-detail_3x` | "music" (sk "hudba") typed: the Music group's links first, by where they are kept, then the history, then the web; the page, and a close-up of the bar with its list |
| `tips` | use-searchbar › google chosen › the search engine dropdown | `use-searchbar/searchbar-change_3x` | Search engine Google: close-up of the bar with the engine dropdown open, Google marked as in use |
| `tips` | ctrl-d-saves-here › settings, the save page shortcut framed | `ctrl-d-saves-here/skratka-nastavenia_3x` | Close-up of Settings → UI and behavior, the "Shortcut to save a page" row framed |
| `tips` | disable-ads › free with the ad bar, premium without it | `disable-ads/odstran-reklamu_3x`, `disable-ads/odstran-reklamu-2_3x` | Signed out (free): the ad bar - the website's slot page - framed; then premium again, the same place framed and empty |
| `tips` | hide-tips › home, the tips bar framed | `hide-tips/tipy-lokacia_3x` | Tips shown (`hideTips` off): the page with the tips bar framed |
| `tips` | hide-tips › the tips bar, its buttons framed | `hide-tips/tipy_3x` | Close-up of the tips bar, its buttons framed |
| `tips` | hide-tips › settings, hide tips framed | `hide-tips/tipy-obnovit_3x` | Close-up of Settings → UI and behavior, "Hide tips" framed |
| `tips` | lets-begin › first run | `lets-begin/1_3x` | Profiles, data and the account removed: the first-run screen |
| `tips` | lets-begin › home with the examples | `lets-begin/2_3x` | The examples with a tip along the bottom |
| `tips` | lets-begin › closed tabs › side panel open on the closed tabs | `lets-begin/3_3x` | The side panel open on Closed |
| `tips` | lets-begin › a subgroup's menu | `lets-begin/4_3x` | The AI subgroup's menu open |
| `tips` | lets-begin › a link's context menu | `lets-begin/5_3x` | AI unfolded, ChatGPT's context menu open, pointer drawn |
| `tips` | open-all-subgroups-link › a subgroup, its open-all button ringed | `open-all-subgroups-link/podskupina-otvorit-linky_3x` | Close-up of the AI subgroup unfolded, its "⇉" in a red ring |
| `tips` | roll-the-subgroup › home, the subgroup framed | `roll-the-subgroup/podskupina-lokacia_3x` | AI unfolded and framed |
| `tips` | roll-the-subgroup › the subgroup unfolded / folded | `roll-the-subgroup/podskupina-rozbalena_3x`, `roll-the-subgroup/podskupina-zrolovana_3x` | Close-ups of AI unfolded, and folded ("4 hidden items") |
| `tips` | set-size › settings, the size slider framed | `set-size/settings_size_3x` | Close-up of Settings → UI and behavior, "Size" framed |
| `tips` | set-size › home at 100% / 75% | `set-size/velkost-100_3x`, `set-size/velkost-75_3x` | The page at size 1 and 0.75 (`scale`) |
| `tips` | subgroup-links-into-tab-group › a subgroup's menu, … framed | `subgroup-links-into-tab-group/podskupina-zachytavat-do-kariet_3x`, `…/podskupina-farba-kariet_3x` | Close-up of AI unfolded with its menu open, "Catch links into tab group" / "Grouped tabs color" framed |
| `theme-showcase` | <theme> › home | `1-<theme>_3x` | The example workspace, background 6 |
| `theme-showcase` | <theme> › recently closed › side panel, a row hovered | `2-<theme>_3x` | As store #2, background 6 |
| `theme-showcase` | <theme> › search suggestions | `3-<theme>_3x` | As store #3, background 6 |
| `theme-showcase` | <theme> › settings, background | `4-<theme>_3x` | Settings → Background, background 6 chosen |
| `theme-showcase` | <theme> › subgroup menu | `5-<theme>_3x` | As store #4, background 6 |
| `theme-showcase` | <theme> › link context menu | `6-<theme>_3x` | As store #5, Aero, background 6 |

## What every scene starts from (`support/stage.ts`)

"Load examples", then made to look used before the first picture:

- **Not example data** - the example mark is cleared as a first edit would, so no "only an example" notice.
- **No tips** - the profile's "hide tips" is on.
- **The profile is named in the reader's language** - "Default" / "Predvolený" (`PROFILE_NAME`).
  The extension seeds "Default" everywhere on purpose: first contact pairs profiles by name.
- **X, LinkedIn and Claude have their icons** - those sites refuse headless Chromium, so their icons are
  put into the favicon cache from Google's favicon service before the examples are drawn
  (`FAVICONS_FROM_GOOGLE`). Another refused site goes into that list.
- **History and closed tabs** - history recording on; four pages really visited and closed
  (`VISITED_PAGES`, per language), then two more from "Work computer" / "Pracovný počítač"
  (`OTHER_DEVICE_PAGES`), plus Apple Music in the history only - open there, never closed - so
  a search can suggest a history entry; all moved to just before the frozen clock.
- **Premium, no ad slot** - a stored session with a premium standing and synchronisation off, so
  nothing asks the account. Only `api.tabilinks.app` is blocked; the website is reachable, for the
  full-size background pictures.

## Page actions (`support/newTabPage.ts`)

| Method | Does |
|---|---|
| `pointerAway()` | Moves the pointer where it opens nothing |
| `openSettings(category?)` | Application menu → Settings, that category alone unfolded and at the top |
| `openSidePanel()` | Rests the pointer on the rail until the panel is open; the card is the `sidePanelCard` preference |
| `hoverClosedTab(index)` | Hovers that row of Recently closed and draws the pointer on it |
| `hoverSuggestion(kind)` | Hovers the first search suggestion of that kind and draws the pointer on it |
| `openSubgroupMenu(index)` | Opens that subgroup's ⋮ menu (0 = first on the page) |
| `openLinkContextMenu(title)` | Right-clicks the link with that title, pointer drawn where it clicked |
| `hoverMenuItem(key)` | Hovers the open menu's item with that locale key's wording and draws the pointer |
| `movePointerTo(x, y)` | Moves the pointer and draws it - headless pictures have none of their own |
| `search(query)` | Types into the search bar, waits for suggestions |
| `hoverBackgroundTile(number)` | Settings → Background open: hovers that tile (the user's own come first) and draws the pointer |
| `addOwnBackground(file)` | Settings → Background open: "+", the file, waits for it behind the page, scrolls back to the section's top |
| `setPreferences(changes)` | Writes device preferences while the page is open; the page follows them as Settings' own |
| `groupsCentre()` | The horizontal middle of the group columns, for a split picture's seam |
| `outline(target, air?, width?, round?)` | Draws a red frame around a selector's first match or an area, kept inside the window; `air` (2) and `width` (4) in CSS px; `round` makes it a ring |
| `boxOf(selector)` | Where the first match is, in CSS px |
| `reload()` | Reloads and waits for the groups |
| `setProfileSettings(changes)` | Merges into the open profile's settings (`{ hideTips: false }`), reloads |
| `becomeFree()` | Removes the staged premium session, reloads, waits for the ad slot to be ready |
| `wipeToFirstRun()` | Removes profiles, their data and the session, keeps device preferences and background: the first-run screen |
| `toggleSubgroup(index)` / `subgroupBox(index)` / `subgroupCloseUp(index)` | Folds/unfolds by its heading; its area; a close-up as wide as its group |
| `settingsRow(key)` / `scrollToMiddle(selector)` | A Settings row's selector by its title key; scrolls it to the middle |
| `menuItem(key)` | The selector of an open options menu's item by its wording key |
| `addProfiles(profiles)` | Adds profiles beside the open one - names, workspaces, a link count - under fixed ids (so the listed order is stable), and reloads |
| `addWorkspaces(names)` | Adds empty workspaces to the open profile after its own, under fixed ids, and reloads; the open one stays open |
| `openSearchEngines()` | Opens the search engine dropdown at the search bar's left end |
| `openProfilesMenu()` / `openProfileManager()` | Opens the header's profiles menu / its "Manage profiles" dialog |
| `areaAround(selectors, margin)` | The area holding the first match of each selector plus a margin, inside the window - a `clip` |
| `restPointerInSidePanel()` | Pointer to the open panel's foot: it stays open, no row hovered |
| `hoverHistoryEntry(title)` | Hovers the history row whose title starts so, pointer drawn |
| `historyRowsAround(title)` | That row and its neighbours' area - a `clip` for `shoot(name, { clip })` |
| `chooseBackground(number)` | Settings → Background → that built-in tile, waits for the picture, closes Settings |

## Not yet possible

- **Browser UI** - the right-click submenu, tab groups in the tab strip, the popup's bubble.
  Headless Chromium draws the page only.
