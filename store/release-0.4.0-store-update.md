# Chrome Web Store update — version 0.4.0

What 0.4.0 is, in one breath: **a reworked interface that is yours to shape.** A more compact,
calmer UI without the flicker and the stray artifacts; light and dark, each **flat or glass
(Aero)** - glass is the default; **sixteen built-in backgrounds or a picture of your own, now on
the free plan too**; and a search bar that looks through **your links, open and closed tabs and
history first**, offering the web search last.

Also in it: the side panel gets a search field, history folded by day, "Keep open", "Closing
takes a click" (replacing the header button), rows that open in this tab with a "⇉" for a new
one, and per-log sync switches; the bookmarking popup always has somewhere to put a link
("New group…"); favicons sit on a disc coloured from the icon; the device-name question is asked
when signing in again. The settings section **"Privacy" is now "Sync & privacy"**.

| Area | Pull requests |
|---|---|
| Glass (Aero) style, default; UI rework | #109, #110, #111, #112, #113, #114, #116, #122, #125, #130, #134, #136, #139 |
| Backgrounds: library, free for everyone, large pictures | #110, #128, #130 |
| Search: profile first, web last | #105 (#85) |
| Side panel | #101, #102, #103, #138, #140, #141, #142 |
| Sync & privacy: per-log sync switches | #104 (#97) |
| Bookmarking always has a place | #100 (#83) |
| Fixes | #99, #123, #124, #133 |

**What changes for the store:** one new permission, `unlimitedStorage` (#127) - it carries **no
install warning**, so users are not asked to re-consent and the extension is not disabled on
update, but the Privacy tab wants a justification for it. Nothing else in the manifest changed
except the version.

---

## 0. Order of work

1. [ ] **Merge the website release PR** (`feature/release-0.4.0` in `new-tab-links-frontend`):
       changelog 0.4.0, the "Make it yours" highlight, the corrected tips and the privacy policy
       wording (section 1). The reviewer may read the policy; users read the changelog.
2. [ ] **Screenshots** (yours): the store set (section 4) and the tip screenshots that no longer
       match (section 1c).
3. [ ] Merge this repo's `feature/release-0.4.0` (version 0.4.0, tip teasers, this file, the
       listing).
4. [ ] Paste into the Developer Dashboard: sections 2, 3 and 5.
5. [ ] Upload `tabilinks.zip` (section 6).
6. [ ] After approval: check the store page in both languages, then announce.

---

## 1. Website — in the release PR

### 1a. Changelog — `public/content/changelog/{en,sk}/0.4.0.md`
Written. Check the date line (`*Released: …*`) against the day the store approves the update.

### 1b. Highlight — `public/content/home-features/{en,sk}/7-make-it-yours.md`
"Tabilinks is yours": themes, backgrounds, more to come. The picture is
`public/images/{en,sk}/home-features/make-it-yours/make-it-yours.svg`, drawn like the other six.

### 1c. Tips corrected (text done; screenshots are yours)

| Tip | What was wrong | Screenshots to retake |
|---|---|---|
| `discover-history` | described the header button, removed in #141 | drop `panel-tlacidlo*` (3 files); new: Settings → "Closing the side panel takes a click", and a row with its "⇉" |
| `change-background` | put the setting under "UI and behavior"; it is its own section, a library | `pozadie_nastavenia` (the tile library) |
| `choose-theme` | knew nothing of the flat / Aero style | optional: the four combinations |
| `use-searchbar` | knew nothing of the suggestions | new: the suggestion list |
| `setup-privacy` | was a title and nothing else, yet linked from the home page | new: Settings → Sync & privacy |

### 1d. Privacy policy — `public/content/legal/{en,sk}/privacy.md`
- "Settings → Privacy" → "Settings → Sync & privacy" (twice per language).
- Backgrounds, added: uploaded pictures stay in the browser and are never synchronised; a built-in
  picture is downloaded from tabilinks.app when chosen, and nothing about the user is sent with
  that request.
- Update the effective date.

---

## 2. Privacy tab

### 2a. Single purpose — unchanged from 0.2.0
(The listing file had kept the 0.1.0 wording; it now holds the current one.)

### 2b. Permission justifications

New, **`unlimitedStorage`**:
```
Keeps the background pictures the user chooses or uploads (up to 3840 px, a few megabytes each) in the browser, beside their links. Without it the browser's 10 MB storage quota is shared with the links, closed tabs and history, and a full profile could not store a single large picture. Nothing in this storage is sent anywhere; uploaded pictures are never synchronised.
```

Changed, **`tabs`** - the open tabs now also appear among the search bar's suggestions, and the
settings section was renamed:
```
Reads the address and title of tabs to: save the current tab as a link; show the tabs open in this browser in a panel on the new tab page, where they can be switched to, closed or saved as links, and offer them as suggestions in the search bar (this list is never stored or sent anywhere); keep the "recently closed tabs" list (address and title of a tab when it closes; on by default); keep the browsing history list (address, title and time of pages visited; off by default, only when the user turns it on); and move a tab opened from a saved link into that link's tab group. Closed tabs and browsing history are synced to the user's account only when signed in, and both can be turned off in Settings → Sync & privacy, which also deletes them.
```

The others (`storage`, `tabGroups`, `contextMenus`, `favicon`, `search`, `<all_urls>`) stay.

### 2c. Data usage — unchanged
Web history stays ticked; only the note's "Settings → Privacy" becomes "Settings → Sync & privacy".
Re-confirm the three certifications.

---

## 3. Store listing — detailed descriptions

Paste both from `store/chrome-web-store-listing.md`, section 1. What changed there:
- a paragraph on making it yours and on the search bar, after the opening;
- two bullets under WHY TABILINKS ("Yours to shape", "One search for everything");
- **"your own background image" removed from PREMIUM** - backgrounds are free now (#110), and
  leaving it there would be the one claim in the listing that is false;
- PRIVACY: "Settings → Sync & privacy", and where background pictures live.

Name and summary (`public/_locales`) are unchanged; they still fit.

---

## 4. Graphics — yours

The suggested five are in the listing file, section 1 → Graphics. The new release is visual, so
the first screenshot should be a workspace in the glass style over a built-in background, and one
should show the search suggestions. The small promo tile can stay.

---

## 5. Test instructions tab

```
The extension works without an account: open a new tab and click "Load examples" on the first screen to get sample workspaces, groups and links.

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

- `tabilinks.zip` in the repo root: version **0.4.0**, built from `feature/release-0.4.0`
  (= `main` at #142 plus the version and the tip teasers), `manifest.json` at the root of the zip.
- Rebuild after any change: `npm run build && rm -f tabilinks.zip && (cd dist && zip -qr -X ../tabilinks.zip .)`
- `npx web-ext lint --source-dir dist`: 0 errors; three warnings - the two expected ones
  (`favicon`, the ignored `service_worker`) and a new one, below.
- Expect a quicker review than 0.2.0's: no new data is collected, and the one new permission
  carries no warning.

### Firefox, when it is published there
`web-ext lint` now warns `MISSING_DATA_COLLECTION_PERMISSIONS`: Firefox asks new add-ons to declare
what they collect, under `browser_specific_settings.gecko.data_collection_permissions`. Chrome
ignores the key. Worth doing before the first Firefox submission - not needed for this upload.
