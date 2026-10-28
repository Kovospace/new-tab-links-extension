# Chrome Web Store update — version 0.4.1

What 0.4.1 is, in one breath: **interface fixes, and the theme one click away.** Menus no longer
run off the screen, the top bar and the search bar fit the window, and a **"Mode" button** in the
top bar switches between light, dark and the system's theme without opening Settings.

| Area | Pull requests / commits |
|---|---|
| Theme switcher in the top bar - "Mode: Light / Dark / System" | #156 (#155) |
| Group, subgroup and other menus kept on screen: above their button when there is no room below | #158 (#157) |
| Workspace head and search bar kept inside the window | #154 |
| Top bar responsive, search bar layout reworked, no wrapping | `b0e22c0`, `bb78520`, `7f7c9c9` (no issue) |
| Example data: a second subgroup ("Directories"), the AI subgroup described as "Chatbots" | `9b74379`, `9f19f42` (no issue) |
| Store screenshots rendered with Playwright | #153, `e405fbe`, `2ab4262`, `25cb557` |

Not in it, though merged after the 0.4.0 tag: #145-#151 (tips bar width, menus keep their element
lit, favicon discs) - the 0.4.0 zip was rebuilt from `main` at #151 (#152) and shipped them.

The version is a patch, as asked; strictly, the theme switcher is a small feature, which this
repo's rule would make 0.5.0.

**What changes for the store:** nothing but the version. No permission, host permission or
`_locales` text changed since 0.4.0, so no re-consent and nothing new in the Privacy tab.

---

## 0. Order of work

1. [ ] Website: commit and merge the changelog entry 0.4.1 - see section 1.
2. [ ] Merge this repo's `feature/release-0.4.1` (this file, the listing, the five screenshots,
       the zip).
3. [ ] Paste into the Developer Dashboard: sections 3 and 5. Section 2 stays as it is.
4. [ ] Upload the five screenshots (section 4), per language.
5. [ ] Upload `tabilinks.zip` (section 6), then move the release's cards **Merged → Deployed**:
       #155, #157.
6. [ ] After approval: move them **Deployed → Done**, check the store page in both languages.

---

## 1. Website

Nothing there is made untrue by this release: no setting moved, nothing was renamed or removed.
The `choose-theme` tip says where the theme is set in Settings, which is still true; it could
mention the "Mode" button as the quicker way.

**Changelog** `public/content/changelog/{en,sk}/0.4.1.md`: written, on `feature/release-0.4.1` in
`new-tab-links-frontend`, not committed yet. The site builds with it (changelog index: 5 per
language) and its 352 tests pass. Check the date line (`*Released: 2026-10-28*`) against the day
the store approves the update.

---

## 2. Privacy tab — unchanged

Single purpose, permission justifications and data usage stay as they were set for 0.4.0.

---

## 3. Store listing — detailed descriptions

Paste both from `store/chrome-web-store-listing.md`, section 1. What changed there:
- under WHY TABILINKS → "Yours to shape", the theme bullet ends with "light, dark or as the
  system, one click away in the top bar" (SK: "svetlý, tmavý alebo podľa systému, jedným klikom
  v hornej lište").

Name and summary (`public/_locales`) are unchanged.

---

## 4. Graphics — rendered

Five screenshots, 1280×800, RGB without alpha, rendered with `npm run screenshots` from the
example data and copied to `store/materials/screenshots/{en,sk}/1-5.png`:

1. the example workspace - light, glass, background 3
2. the side panel on Recently closed, a row from the work computer hovered
3. the search bar: "music" - saved links, a history entry, "search the web"
4. a subgroup's menu - dark, glass, background 12
5. a link's right-click menu - dark, flat, background 12

A sixth, Settings → Background, is rendered too (`screenshots/versions/0.4.1/store/<lang>/6-settings-background.png`);
the store takes five. Replace all of the current ones: they show the 0.4.0 interface. The small
promo tile stays.

---

## 5. Test instructions tab

The 0.4.0 text with one line added, the second paragraph. Fill in the reviewer account.

```
The extension works without an account: open a new tab and click "Load examples" on the first screen to get sample workspaces, groups and links.

New in this version: the "Mode" button in the top bar switches between light, dark and the system's theme.

Appearance: menu (three dots, top right) → Settings → "UI and behavior" sets the theme (light/dark) and the theme style (flat/Aero); Settings → "Background" chooses one of sixteen pictures or uploads one. Built-in pictures are downloaded from https://tabilinks.app/backgrounds/ when chosen.

Search: type in the search bar at the top - saved links, open tabs, closed tabs and history are suggested first, the web search last.

The panel on the right edge opens when the pointer rests on it. It has three cards: Open (tabs open in this browser), Closed (recently closed tabs) and History. Browsing history is off by default: turn it on in Settings → "Sync & privacy", then visit a few pages and open a new tab. Turning either recording off there asks for confirmation and deletes what was recorded.

To test synchronisation, sign in from the menu with this test account:
  username: <reviewer account>
  password: <password>
Sign in on a second Chrome profile with the same account to see links, closed tabs and history appear there. The sign-in dialog has a "Synchronise this browser" checkbox (ticked by default); unticked, the browser is signed in but nothing is synchronised.

The banner at the bottom is our own premium offer, loaded from https://tabilinks.app/slot/workspace-footer.html.
```

---

## 6. Package

- `tabilinks.zip` in the repo root: version **0.4.1**, built from `main` at #158 (`25cb557`),
  `manifest.json` at the root of the zip.
- `npm test`: 927 tests passing.
- `npx web-ext lint --source-dir dist`: 0 errors; the same three warnings as 0.4.0 (`favicon`, the
  ignored `service_worker`, `MISSING_DATA_COLLECTION_PERMISSIONS` - Firefox only).
- Expect a quick review: no new permission, no new data, no change to what is collected.
