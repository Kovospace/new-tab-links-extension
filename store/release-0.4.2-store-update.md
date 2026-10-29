# Chrome Web Store update — version 0.4.2

What 0.4.2 is, in one breath: **fixes only.** Dialogs and the bookmarking popup no longer close
under a text selection, and many or wide groups wrap instead of scrolling sideways.

| Area | Pull requests / commits |
|---|---|
| A dialog closes on its backdrop only when the press and the release both land there - selecting text and letting go outside no longer closes it | #163 (#161, #162) |
| The bookmarking popup no longer closes when its preselected name is dragged (Chrome closes an action popup when a drag starts) | #164 (#161) |
| Group columns wrap to fit the window, each as wide as its links up to 25em | `b360eee`, #165 (no issue) |
| Right padding of the workspace heading with the search bar | `611621e` (no issue) |
| Theme showcase screenshots for the website | #160 - tooling, not in the package's behaviour |

The 0.4.1 zip was built at #158 (`25cb557`), so everything above is new in 0.4.2.

**What changes for the store:** the version and one line of the test instructions. No permission,
host permission or `_locales` text changed since 0.4.1, so no re-consent and nothing new in the
Privacy tab.

---

## 0. Order of work

1. [ ] Website: commit and merge the changelog entry 0.4.2 - see section 1.
2. [ ] Merge this repo's `feature/release-0.4.2` (this file, the listing, the manifest, the zip).
3. [ ] Paste the test instructions into the Developer Dashboard (section 5). Sections 2 and 3 stay
       as they are.
4. [ ] Upload `tabilinks.zip` (section 6), then move the release's cards **Merged → Deployed**:
       #161, #162.
5. [ ] After approval: move them **Deployed → Done**.

---

## 1. Website

Nothing there is made untrue by this release: no setting, tip, permission or collected data
changed.

**Changelog** `public/content/changelog/{en,sk}/0.4.2.md`: written, on `feature/release-0.4.2` in
`new-tab-links-frontend`, not committed yet. The site builds with it (changelog index: 6 per
language) and its 352 tests pass. Check the date line (`*Released: 2026-10-29*`) against the day
the store approves the update.

---

## 2. Privacy tab — unchanged

---

## 3. Store listing — detailed descriptions unchanged

Name and summary (`public/_locales`) are unchanged too.

---

## 4. Graphics — keep the 0.4.1 screenshots

The five uploaded for 0.4.1 still show the current interface. The only visible difference is that
groups are now as wide as their links rather than a quarter of the window, which the example
workspace in screenshot 1 hardly shows. Re-render with `npm run screenshots` only if you want the
pictures to match 0.4.2 exactly.

---

## 5. Test instructions tab

The 0.4.1 text with the "New in this version" line replaced. Fill in the reviewer account.

```
The extension works without an account: open a new tab and click "Load examples" on the first screen to get sample workspaces, groups and links.

New in this version: fixes only. A dialog no longer closes when text is selected in a field and the mouse is released outside it, the bookmarking popup (toolbar icon) no longer closes when selected text is dragged, and many or wide groups wrap onto further rows instead of scrolling sideways.

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

- `tabilinks.zip` in the repo root: version **0.4.2**, built from `main` at #165 (`6ac0480`) plus
  the version bump, `manifest.json` at the root of the zip.
- `npm test`: 928 tests passing.
- `npx web-ext lint --source-dir dist`: 0 errors; the same three warnings as 0.4.1 (`favicon`, the
  ignored `service_worker`, `MISSING_DATA_COLLECTION_PERMISSIONS` - Firefox only).
- Expect a quick review: no new permission, no new data, no change to what is collected.
