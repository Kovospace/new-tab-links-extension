# Chrome Web Store listing — Tabilinks

Everything to paste into the Developer Dashboard (https://chrome.google.com/webstore/devconsole),
tab by tab. English is the default listing; Slovak is added under "Add localized listing".

---

## 0. Before uploading: name and summary come from the manifest

The store does **not** let you type the title and the summary. It reads them from
`public/_locales/<lang>/messages.json` (`extensionName`, `extensionDescription`). They are set to
the following; change them there, not in the dashboard. `extensionShortName` ("Tabilinks") is
the manifest's `short_name`, used where the full name does not fit - the right-click menu
entries read "Bookmark this page with Tabilinks".

| Key | Limit | en | sk |
|---|---|---|---|
| `extensionName` | 75 chars (about 45 are visible) | `Tabilinks: grouped links & history on new tab` | `Tabilinks: linky v skupinách na novej karte` |
| `extensionDescription` | 132 chars | `Your links on every new tab: sorted into groups created inside workspaces, synced across all your devices.` | `Vaše záložky a história na každej novej karte: v skupinách a pracovných priestoroch, synchronizované naprieč Vašimi zariadeniami.` |

---

## 1. Store listing tab

**Category:** Productivity → Workflow & Planning
**Language:** English (then add Slovak)

### Detailed description — English

```
A new tab that finally does something useful.

Tabilinks replaces the empty new tab page with your own links, organised into a logical hierarchical structure of Workspaces, their Groups and optional Subgroups, all within switchable Profiles.

As a bonus, the history of visited pages, recently closed tabs and the list of currently open tabs - all accessible without a single click: just hover the mouse over the panel on the right side.

Of course, everything mentioned can be backed up and synchronised across all your browsers and devices.

Make it feel like home: light or dark, flat or see-through glass, with one of sixteen backgrounds or a picture of your own. And the search bar looks through your saved links, open and closed tabs and history before it offers the web.

WHO IT IS FOR

• People with many bookmarks who want order rather than another wall of speed-dial tiles
• People who work in more than one browser or on more than one computer
• People who want to save a page in two clicks and find it again in one
• People who value privacy and want to decide what is tracked and what is not
• People looking for a bookmarks solution that is simple, fast and not bloated with unnecessary widgets and over-engineered functions and configurations

WHY TABILINKS

• A real hierarchy:
  - profiles meant for roles (work, home)
  - workspaces for topics
  - groups and subgroups for categories of links within that topic
• Compatibility:
  - works in every Chromium browser and syncs between them - Chrome, Brave, Edge and others - with a free account
• Privacy:
  - works fully without any account too: nothing reaches our servers until you sign in
  - you choose what to track and sync
• Fairness:
  - the free version is complete - premium mainly lifts limits and removes a small banner
  - 95% of users should never reach the free limits
  - no hidden traps forcing you to give in and buy premium
• Yours to shape:
  - light and dark theme, each flat or glass (Aero) - light, dark or as the system, one click away in the top bar
  - sixteen built-in backgrounds or your own picture - in the free version too
• One search for everything:
  - your links, open tabs, closed tabs and history first, the web search last
• Only useful functions:
  - no widgets, notes, to-do lists, clocks, weather or other fluff that is everywhere
• Independent developer:
  - who is aware of what evil corporations do - but from this garage your data is not going anywhere

WHAT PROBLEMS IT SOLVES, WHY TABILINKS IS UNIQUE

• Unused or useless space on the new tab page of most browsers
• Bookmarks in most browsers:
  - take long to save and even longer to find
  - are even harder to organise
  - Tabilinks inverts this logic and makes saving fast and reaching even faster
• Most extensions like this are some kind of "Opera Speed Dial" tiles
• Some good extensions with a hierarchy and syncing are pricey and bloated with fluff like to-do lists, notes, clocks, weather, ...
• Includes the functionality of a simple tab group manager too:
  - put links inside a subgroup and they are always caught into that subgroup's tab group
• Batch link opening:
  - open all links of a subgroup at once

FREE AND PREMIUM

FREE VERSION:
- UNLIMITED* number of links
- 1 profile
- 2 workspaces
- 5 synced installations
- memory for the last 25 closed tabs
- memory for the last 50 history entries
- a small banner at the bottom

PREMIUM VERSION:
- practically UNLIMITED*
- no banner at the bottom

*UNLIMITED under the fair use policy (https://tabilinks.app/fair-use)
- generous limits: we expect 99.99% of users never to reach them
- if you somehow do, write to us and explain your use case so we can make it work for you

PRIVACY

Without an account your links never leave your browser; only an anonymous daily count of opened new tabs is sent. Open tabs are never stored or sent. Closed tabs are recorded by default and browsing history only when you turn it on - both can be switched off in Settings → Sync & privacy, which also deletes them. Pictures you upload as a background stay in your browser; a built-in one is downloaded from tabilinks.app when you choose it. With an account, your links, closed tabs and (if on) history are stored to sync them - unless you untick "Synchronise this browser" when signing in or in the menu, which keeps everything on this browser while premium still applies. Full policy: https://tabilinks.app/privacy

OTHER

How Tabilinks compares with other new tab extensions: https://tabilinks.app/compare
Website: https://tabilinks.app
```

### Detailed description — Slovak

```
Nová karta, ktorá konečne k niečomu je.

Tabilinks nahradí prázdnu novú kartu vašimi vlastnými odkazmi, usporiadanými do logickej hierarchickej štruktúry: pracovné priestory, v nich skupiny a voliteľné podskupiny, a to všetko v rámci prepínateľných profilov.

Ako bonus história navštívených stránok, nedávno zatvorené karty a zoznam práve otvorených kariet - všetko dostupné bez jediného kliknutia: stačí prejsť myšou nad panel na pravej strane.

Samozrejme, všetko spomenuté sa dá zálohovať a synchronizovať naprieč všetkými vašimi prehliadačmi a zariadeniami.

Aby ste sa tu cítili ako doma: svetlý alebo tmavý vzhľad, plochý alebo priehľadné sklo, s jedným zo šestnástich pozadí alebo vlastným obrázkom. A vyhľadávacie pole najprv prehľadá vaše uložené odkazy, otvorené a zatvorené karty a históriu, až potom ponúkne web.

PRE KOHO JE

• Pre ľudí s množstvom záložiek, ktorí chcú poriadok, nie ďalšiu stenu dlaždíc rýchlej voľby
• Pre ľudí, ktorí pracujú vo viacerých prehliadačoch alebo na viacerých počítačoch
• Pre ľudí, ktorí chcú stránku uložiť na dva kliky a nájsť ju na jeden
• Pre ľudí, ktorým záleží na súkromí a chcú sami rozhodnúť, čo sa bude zaznamenávať a čo nie
• Pre ľudí, ktorí hľadajú jednoduché a rýchle riešenie záložiek, nezahltené zbytočnými widgetmi a prekomplikovanými funkciami a nastaveniami

PREČO TABILINKS

• Skutočná hierarchia:
  - profily pre role (práca, domov)
  - pracovné priestory pre témy
  - skupiny a podskupiny pre kategórie odkazov v rámci témy
• Kompatibilita:
  - funguje vo všetkých prehliadačoch na Chromiu a s bezplatným účtom sa medzi nimi synchronizuje - Chrome, Brave, Edge a ďalšie
• Súkromie:
  - funguje úplne aj bez účtu: kým sa neprihlásite, na naše servery sa nič nedostane
  - sami si vyberiete, čo sa bude zaznamenávať a synchronizovať
• Férovosť:
  - bezplatná verzia je kompletná - premium hlavne zvyšuje limity a odstraňuje malý banner
  - 95 % používateľov by na limity bezplatnej verzie nemalo nikdy naraziť
  - žiadne skryté pasce, ktoré by vás nútili vzdať sa a kúpiť premium
• Prispôsobíte si ho:
  - svetlý a tmavý vzhľad, každý plochý alebo sklenený (Aero) - svetlý, tmavý alebo podľa systému, jedným klikom v hornej lište
  - šestnásť vstavaných pozadí alebo vlastný obrázok - aj v bezplatnej verzii
• Jedno vyhľadávanie na všetko:
  - najprv vaše odkazy, otvorené a zatvorené karty a história, vyhľadávanie na webe nakoniec
• Len užitočné funkcie:
  - žiadne widgety, poznámky, zoznamy úloh, hodiny, počasie ani iná vata, ktorá je všade
• Nezávislý vývojár:
  - ktorý vie, čo robia zlé korporácie - ale z tejto garáže vaše dáta nikam nejdú

ČO RIEŠI A PREČO JE TABILINKS JEDINEČNÝ

• Nevyužité alebo zbytočné miesto na novej karte väčšiny prehliadačov
• Záložky vo väčšine prehliadačov:
  - uložiť ich trvá dlho a nájsť ešte dlhšie
  - usporiadať ich je ešte ťažšie
  - Tabilinks túto logiku obracia: ukladanie je rýchle a otvorenie ešte rýchlejšie
• Väčšina podobných rozšírení sú len nejaké dlaždice v štýle „Opera Speed Dial“
• Niektoré dobré rozšírenia s hierarchiou a synchronizáciou sú drahé a preplnené vatou ako zoznamy úloh, poznámky, hodiny, počasie...
• Obsahuje aj funkcie jednoduchého správcu skupín kariet:
  - vložte odkazy do podskupiny a tá ich vždy zachytí do svojej skupiny kariet
• Hromadné otváranie odkazov:
  - otvorte všetky odkazy podskupiny naraz

ZADARMO A PREMIUM

BEZPLATNÁ VERZIA:
- NEOBMEDZENÝ* počet odkazov
- 1 profil
- 2 pracovné priestory
- 5 synchronizovaných inštalácií
- pamäť na posledných 25 zatvorených kariet
- pamäť na posledných 50 záznamov histórie
- malý banner v spodnej časti

PREMIUM VERZIA:
- prakticky všetko NEOBMEDZENÉ*
- bez bannera v spodnej časti

*NEOBMEDZENÉ v rámci zásad primeraného používania (https://tabilinks.app/sk/fair-use)
- štedré limity: očakávame, že 99,99 % používateľov na ne nikdy nenarazí
- ak ich predsa dosiahnete, napíšte nám a vysvetlite svoj prípad, aby sme to pre vás vyriešili

SÚKROMIE

Bez účtu vaše odkazy nikdy neopustia prehliadač; posiela sa len anonymný denný počet otvorených nových kariet. Otvorené karty sa nikdy neukladajú ani neodosielajú. Zatvorené karty sa zaznamenávajú predvolene, história prehliadania len keď ju zapnete - oboje sa dá vypnúť v Nastaveniach → Synchronizácia a súkromie, čím sa aj vymaže. Obrázky, ktoré si nahráte ako pozadie, zostávajú vo vašom prehliadači; vstavaný sa stiahne z tabilinks.app, keď si ho vyberiete. S účtom sa vaše odkazy, zatvorené karty a (ak je zapnutá) história ukladajú, aby sa dali synchronizovať - pokiaľ pri prihlásení alebo v menu nezrušíte „Synchronizovať tento prehliadač“; vtedy všetko zostane v tomto prehliadači a premium aj tak platí. Celé zásady: https://tabilinks.app/sk/privacy

ĎALŠIE

Porovnanie Tabilinks s inými rozšíreniami novej karty: https://tabilinks.app/sk/compare
Web: https://tabilinks.app/sk
```

### Graphics

| Asset | Size | Status |
|---|---|---|
| Store icon | 128×128 PNG | have it: `public/icons/icon-128.png` |
| Screenshots | 1280×800 (or 640×400), 1–5 | rendered (`npm run screenshots`, see `screenshots/CATALOGUE.md`) into `screenshots/versions/<version>/store/<lang>/`; the five uploaded are copied to `store/materials/screenshots/<lang>/1-5.png` (24-bit, no alpha) |
| Small promo tile | 440×280 | have it: `store/materials/promo/small-promo-tile.png`, Slovak `small-promo-tile-sk.png` (sources: the `.html` beside them) |
| Marquee promo tile | 1400×560 | optional - skipped for the first release; only used if Google features the extension |

Screenshots, in this order (the first one is what most people see). Rendered from the example
data with Playwright, in both languages; the scenes are `screenshots/store.shots.ts`:
1. `1-home` - the example workspace, light, glass (Aero), background 3
2. `2-recently-closed` - the side panel open on Recently closed, a row from the work computer hovered
3. `3-search` - "music": saved links, a history entry and "search the web"
4. `4-subgroup-menu` - dark, glass, background 12: a subgroup's menu
5. `5-link-context-menu` - dark, flat, background 12: a link's right-click menu

A sixth is rendered, `6-settings-background` (Settings → Background, the library of pictures);
the store takes five, so it is left out - swap it in for one of the above if wanted.

Small promo tile: the logo, the website's wordmark and "Your bookmarks, grouped, on every new tab".

### Links
- Official URL / homepage: `https://tabilinks.app`
- Support URL: `https://tabilinks.app` (or a support e-mail address)

---

## 2. Privacy tab

### Single purpose
```
Tabilinks replaces the new tab page with the user's own links, organised into profiles, workspaces, groups and subgroups, together with the user's open tabs, recently closed tabs and - when the user turns it on - recently visited pages, and helps open and save them as browser tabs.
```

### Permission justifications

| Permission | Justification to paste |
|---|---|
| `storage` | `Stores the user's workspaces, groups, links and settings locally in the browser, and the sign-in session when the user has an account.` |
| `tabs` | `Reads the address and title of tabs to: save the current tab as a link; show the tabs open in this browser in a panel on the new tab page, where they can be switched to, closed or saved as links, and offer them as suggestions in the search bar (this list is never stored or sent anywhere); keep the "recently closed tabs" list (address and title of a tab when it closes; on by default); keep the browsing history list (address, title and time of pages visited; off by default, only when the user turns it on); and move a tab opened from a saved link into that link's tab group. Closed tabs and browsing history are synced to the user's account only when signed in, and both can be turned off in Settings → Sync & privacy, which also deletes them.` |
| `tabGroups` | `Opens a subgroup of links as a Chrome tab group with its name and colour, finds that group again to add newly opened links to it, and repaints it when the user changes the colour.` |
| `contextMenus` | `Adds "Bookmark this page with Tabilinks" and "Bookmark this link with Tabilinks" to the right-click menu. Each is a submenu listing the groups and subgroups of the user's open workspace; choosing one saves the page or the link there. The last entry opens the extension's bookmarking popup instead.` |
| `favicon` | `Shows each saved link with its website icon, using Chrome's own favicon cache.` |
| `search` | `The search bar on the new tab page can send the query to the browser's default search engine through chrome.search.` |
| `unlimitedStorage` | `Keeps the background pictures the user chooses or uploads (up to 3840 px, a few megabytes each) in the browser, beside their links. Without it the browser's 10 MB storage quota is shared with the links, closed tabs and history, and a full profile could not store a single large picture. Nothing in this storage is sent anywhere; uploaded pictures are never synchronised.` |
| Host permission `<all_urls>` | `Saved links can point to any website. When Chrome has no cached icon for a link, the extension downloads that page's HTML and its icon file to display the icon next to the link. No page content is stored or sent anywhere; only the icon image is kept locally. The same access is used to reach the extension's own sync server (api.tabilinks.app).` |

### Remote code
**No, I am not using remote code.**
(The ad banner is a cross-origin `<iframe>` of tabilinks.app shown in the page; no remotely loaded script runs in the extension.)

### Data usage — tick these
- [x] **Personally identifiable information** — e-mail address and username, only when the user creates or signs in to an account
- [x] **Authentication information** — the password at sign-in and the session tokens
- [x] **Web history** — recently closed tabs (on by default) and, if the user turns it on, visited pages (address, title, time, device name) are synced to the account when signed in; both can be turned off in Settings → Sync & privacy
- [ ] Health, Financial and payment (payments happen on the website, never in the extension), Personal communications, Location, User activity, Website content — **no**

Then tick all three certifications:
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

### Privacy policy URL
`https://tabilinks.app/privacy`

---

## 3. Distribution tab
- Payments: **Free of charge** (premium is sold on the website, not through the store)
- Visibility: **Unlisted** for the first release, to try a real store install; switch to **Public** afterwards
- Regions: all

## 4. Test instructions tab (for the reviewer)
```
No account is needed to test the extension. Open a new tab: the first screen offers "- Load examples", which fills the page with a sample workspace, three groups of links and two subgroups. Everything below works on that data.

LINKS AND GROUPS
- Click a link to open it in this tab. Each group, subgroup and link has a menu: the "⋮" button of a group or subgroup, or a right-click on a link. Near the bottom of the window these menus open upwards.
- Click a subgroup's heading to fold or unfold it.
- Drag a link, a subgroup or a group to move it; drop a link on the bar at the bottom (it turns red while dragging) to delete it.
- "+ Add group" next to the workspace's name, and "+" next to "Workspaces" in the top bar, add a group and a workspace.

APPEARANCE
- The "Mode" button in the top bar ("Mode: System" by default) switches between light, dark and the system's theme.
- Menu (three dots, top right) → Settings → "UI and behavior" holds the same theme, the theme style (flat or glass, "Aero") and the interface size. Settings → "Background" chooses one of sixteen pictures or uploads one. A built-in picture is downloaded from https://tabilinks.app/backgrounds/ when chosen; an uploaded one stays in the browser.

SEARCH
Type in the search bar at the top, for example "music". Saved links, open tabs, recently closed tabs and history are suggested first, the web search last. Enter opens the highlighted suggestion.

SIDE PANEL
Rest the pointer on the strip at the right edge of the page and the panel opens. It has three cards: "Open" (tabs open in this browser - click to switch, "x" to close), "Closed" (recently closed tabs; recorded by default) and "History". Browsing history is off by default: turn it on in Settings → "Sync & privacy", visit a few pages, then open a new tab. Turning either recording off there asks for confirmation and deletes what was recorded. "Keep open" in the panel's head keeps it open.

SAVING THE CURRENT PAGE
On any http(s) page, click the extension's toolbar icon or press Alt+Shift+D: a popup asks for the workspace, group and subgroup, and offers "New group…" and "New subgroup…". Right-clicking a page or a link offers "Bookmark this page with Tabilinks" / "Bookmark this link with Tabilinks", with the groups as a submenu and "Choose a place…" for the popup.

TAB GROUPS
A subgroup's menu → "Open all links in grouped tabs" opens its links in a browser tab group of the subgroup's colour. "Catch links into tab group" makes a tab that navigates to one of the subgroup's links join that group.

SYNCHRONISATION (needs the test account)
Menu (three dots, top right) → "Log in", with:
  username: <reviewer account>
  password: <password>
The dialog has a "Synchronise this browser with the account" checkbox, ticked by default; unticked, the browser is signed in but nothing is synchronised. Sign in with the same account in a second Chrome profile to see the links, closed tabs and history appear there. The account menu's status row is a checkbox that switches synchronisation off and on.

NETWORK
- https://api.tabilinks.app - the account and synchronisation, only while signed in; and an anonymous daily count of opened new tabs (a number per day, no identifier), sent without credentials.
- https://tabilinks.app - the built-in backgrounds, and the banner at the bottom of the page: our own premium offer, loaded in a frame from https://tabilinks.app/slot/workspace-footer.html. A premium account has no banner.
- Website icons come from the browser's own icon cache (the "favicon" permission), or else from the sites themselves.
```
Create a dedicated reviewer account for this, and do not reuse your own.
