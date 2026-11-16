# Chrome Web Store update — version 0.5.0

What 0.5.0 is, in one breath: **save as fast as you browse, and make it yours.** **Favorites**
one click away - a circle on every link, a Favorites card in the side panel, a list in the
toolbar popup; **Flash save** from a new right-click menu ("Tabilinks" › Flash save, Add bookmark…,
Save to group) or **Alt+Shift+F**, with a setting that leaves Flash save alone at the menu's
root; **seven accent colours** instead of blue; group columns **resized by their corner**, and a
group's links **sorted** by date or name.

Also in it: no first-run screen - a new install opens straight into "My space" with a widget to
create a group, **import the browser's bookmarks** or log in; signing in asks "username and
password" or "sync code" first; a fresh install starts on a built-in background; the toolbar
popup welcomes a new user; the side panel moved **to the left** and is kept open by default; an
empty group shows a hint; English says **"Space"** instead of "Workspace"; Settings has a new
**"Functions"** section (Favorites, Drag and drop, Hide tips); the premium note at the bottom is
a personal message in the page's own colours.

| Area | Pull requests |
|---|---|
| Favorites | #197 (#183) |
| Flash save, the right-click menu, its setting, Alt+Shift+F | #205 (#204) |
| Accent colour | #201 (#200) |
| Resize groups, sort links | #195 (#173), #194 (#184) |
| Straight into a space, welcome widget, bookmark import, the page with no space, two-step sign-in | #196 (#182) and the follow-up commit "change login cycle" |
| First start: default background, popup welcome | #193 (#175), #181 (#172) |
| Side panel on the left, kept open by default | #192, #188 (#178) |
| "Space" instead of "Workspace" (English), "plocha" (Slovak) | #206, #185 |
| Smaller fixes: empty-group hint, red close buttons, settings folded, search bar limits, ads bar width, premium note colours | #190 (#187), #191 (#176), #189, #199 (#198), #203 (#202), #207 (#180) |

**What changes for the store:**
- One **optional** permission, `bookmarks`. It is requested only when the user clicks "Import
  bookmarks from the browser", so it carries **no install warning and no re-consent on update** -
  the extension is not disabled for existing users. The Privacy tab wants a justification for it
  (2b).
- One more keyboard command, `flash-save` (suggested Alt+Shift+F). Commands need no permission.
- The summary changed in English ("spaces") and Slovak ("plochách"). It comes from
  `public/_locales`, nothing to type.

---

## 0. Order of work

1. **Website first** - the release PR on `feature/release-0.5.0` in `new-tab-links-frontend`:
   changelog, corrected tips and the claims sweep (section 1). Merge it and deploy the site. The
   reviewer may read the privacy policy, and the slot page is already live with the new note.
2. **Screenshots** - rendered for 0.5.0 by `screenshot-maker` (section 4); copy the five store
   pictures into `store/materials/screenshots/<lang>/` and look at them.
3. **Merge this PR** (`feature/release-0.5.0`).
4. **Paste** the Privacy tab changes (2b), the descriptions (3) and the test instructions (5).
5. **Upload** `tabilinks.zip` (6), submit for review. Then move the cards Merged → Deployed (the
   board, below).

## 1. Website — in the release PR

Branch `feature/release-0.5.0` in `new-tab-links-frontend`. Its build pre-renders 78 routes and
its 352 tests pass.

### 1a. Changelog — `public/content/changelog/{en,sk}/0.5.0.md`
The four lead features as the bullets, in this order: favorites, Flash save and the menu, the
accent colour, resizing and sorting. Sections follow: a new start, the side panel, Settings, and
everything else. Each links its tips by their own titles. The accent colour and resize/sort
sections link no tip, because none exists yet.

### 1b. Tips corrected (text done; screenshots are yours)

| Tip | What changed | Screenshots to retake |
|---|---|---|
| `lets-begin` | no first screen or examples: the "My space" widget, two-step log in, the panel on the left | 1, 2, 3 (check 4 and 5) |
| `saving-from-webpage` | the Tabilinks menu: Flash save + Alt+Shift+F, Add bookmark…, Save to group; the fast-paced setting; a full space | **image 1 by hand** - Chrome's own menu, the tool cannot render it (it shows the old entry; the EN tip uses the SK picture) |
| `hide-tips` | Settings → Functions | `tipy-obnovit` |
| `use-drag-and-drop` | Settings → Functions; tabs dragged out of the panel; dropping on Favorites | `nastavenia-presun` |
| `discover-history` | panel on the left, open by default; the Favorites card; the circle on rows | `panel-zrolovany`, `panel-otvoreny`, `panel-pridat-link` |
| `bookmark-into-new-group` | "Choose a place…" is now "Add bookmark…" | `panel-ulozit` |
| `setup-privacy` | the wording on what reaches the servers; a fresh install downloads a background; bookmark import | - |

Also likely out of date (no text change):
- **Settings pictures**, since categories now start folded and UI and behavior gained rows:
  `set-size/settings_size`, `ctrl-d-saves-here/skratka-nastavenia`,
  `setup-privacy/nastavenia-sukromie`, `change-background/pozadie_nastavenia`.
- `disable-ads/odstran-reklamu*` - the premium note changed.
- The hand-made download-page pictures `install/standart-login-menu*` and
  `use-connection-code-3/-4`. There is no "Enter sync code" item any more, and Log in asks the
  method first. Their alt texts still describe the old pictures; update both together.

### 1c. Claims sweep
- **Privacy policy (EN and SK):**
  - bookmark import is optional, asked only on import, read in the browser and never sent;
  - a fresh install downloads a built-in background;
  - synchronised content includes profile settings and which links are favorites.
  - **`LEGAL_DOCUMENTS_EFFECTIVE_DATE` moved to 2026-11-15.**
- **FAQ:** the panel is on the left; signing in is with username and password, or the pairing code.
- **Comparison note:** "nothing *of yours* reaches our servers until you sign in" (tab counts and
  background downloads do reach them).
- **Home page "Saves time":** the panel is on the left and open.
- **Download page tutorial:** the two-step log in.
- **Not changed:** the FAQ names only the Chrome Web Store. That matters only once a Firefox
  listing ships.

### 1d. Proposed, not written
- **Highlight:** an `8-flash-save` home-page point, "Save in one click", with a new SVG. Favorites
  becomes a bullet in an existing point rather than a point of its own.
- **New tips:**
  - "Mark your favorites";
  - "Flash save: keep a page in one click", or a section of `saving-from-webpage`;
  - "Choose your accent colour", or a section of `choose-theme`;
  - "Resize a group and sort its links";
  - "Import your bookmarks from the browser";
  - optionally an FAQ entry on bookmark import.

## 2. Privacy tab

### 2a. Single purpose — unchanged

### 2b. Permission justifications — one changed, one new

`contextMenus` - **changed** (the menu is new):
```
Adds a "Tabilinks" entry to the right-click menu of a page or a link, with three actions: "Flash save" saves the page or the link at once into a "Flash save" group of the user's open space; "Add bookmark…" opens the extension's bookmarking popup with it filled in; "Save to group" lists the groups and subgroups of the open space, and choosing one saves it there. A setting can reduce the menu to the single "Tabilinks: Flash save" entry.
```

`bookmarks` (optional) - **new**:
```
Optional, requested only when the user clicks "Import bookmarks from the browser" on an empty space. The browser's bookmark tree is read once, in the browser, to offer its folders as groups; the chosen ones are saved as the user's links. Nothing is read without that click, and the bookmarks themselves are never sent anywhere - only the links the user chose to import, which are synchronised like any other link when signed in.
```

The others (`storage`, `tabs`, `tabGroups`, `favicon`, `search`, `unlimitedStorage`, `<all_urls>`)
are unchanged; `tabs` still covers everything it is read for (Flash save reads the active tab's
address and title, which "save the current tab as a link" already says).

### 2c. Data usage — unchanged

Favorites are a mark on a link and travel with the links; bookmark import stores only the links
the user chose. Nothing new is collected.

## 3. Store listing — detailed descriptions

`store/chrome-web-store-listing.md` is updated; paste both descriptions whole. What changed, in
both languages:
- the side panel is **on the left**, open by default, and lists favorites;
- a new paragraph and a "Save in one click, find in one" block: Flash save, the menu,
  Alt+Shift+F, favorites, bookmark import;
- "Yours to shape" gains the accent colours and resizing/sorting groups;
- the privacy paragraph says bookmark import reads in the browser, only when asked;
- English says "spaces"; **Slovak now says "plochy"** everywhere ("pracovné priestory" was left
  over from before the extension's own Slovak changed).

## 4. Graphics — rendered, look them over

Rendered for 0.5.0 by `screenshot-maker`: 124 of 124 scenes, 128 pictures, in
`screenshots/versions/0.5.0/`:

| Target | en | sk |
|---|---|---|
| store | 6 | 6 |
| theme-showcase | 12 | 12 |
| tips | 46 | 46 |

- **Store:** the five upload pictures are already in `store/materials/screenshots/{en,sk}/1-5.png`,
  1280×800, 24-bit with no alpha. They show the "Spaces" header and the panel on the left.
  Picture 2 is staged with the panel kept open, so the header fits beside it; opened by the
  pointer, the Slovak search field ran past the edge. Upload them in place of the 0.4.x ones.
- **Scenes fixed:**
  - the favicons are now cached before the examples are stored, so X and LinkedIn are no longer
    broken icons;
  - hide-tips and drag-and-drop open Settings → Functions.
- **Website:** the tips and theme-showcase pictures are copied into
  `new-tab-links-frontend/public/images/` and converted to WebP at 1x, 2x and 3x, replacing the
  old ones.
- **Still by hand:**
  - `saving-from-webpage/1`: Chrome's own right-click menu with the new "Tabilinks" entry. It is
    not a scene; the EN tip uses the SK picture.
  - the download page's `install/standart-login-menu*` and `use-connection-code-3/-4`, with their
    alt texts;
  - `demo/1-9`, made by hand.
- Suggested, optional: swap one store picture for favorites on (circles and the Favorites card)
  or for Settings with the accent swatches. Neither has a scene yet.

## 5. Test instructions tab

The text in the listing (section 4 there) is rewritten for 0.5.0: no "Load examples" (gone), the
welcome tiles, favorites, the right-click menu and Alt+Shift+F, the accent colour, resizing and
sorting, the side panel on the left, and the two-step sign-in. Paste it whole; replace the
reviewer account placeholders.

## 6. Package

- `public/manifest.json` `"version": "0.5.0"`.
- Built with `npm test` (1080 passed), `npm run build`, then
  `rm -f tabilinks.zip && (cd dist && zip -qr -X ../tabilinks.zip .)` - `manifest.json` at the
  zip's root, version 0.5.0, 438 KB.
- `npx web-ext lint --source-dir dist`: **0 errors**; the three expected warnings only
  (`MANIFEST_PERMISSIONS` for Chrome's `favicon`, `MISSING_DATA_COLLECTION_PERMISSIONS`,
  `BACKGROUND_SERVICE_WORKER_IGNORED`).
- Review: an optional permission and a changed `contextMenus` use are the kind of change that
  can draw a closer look - plan for a few days rather than one.

## The board

Every extension card shipped in 0.5.0 is in **Merged**: #172, #173, #175, #176, #178, #180,
#182, #183, #184, #187, #198, #200, #202, #204. When the upload is submitted, move them to
**Deployed**; when review passes, to **Done**. Released without an issue: the side panel move to
the left (#192), "Settings: every category starts folded" (#189), the Slovak "plocha" wording
(#185) and the "Space" rename (#206).
