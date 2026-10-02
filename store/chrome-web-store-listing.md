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
| `extensionName` | 75 chars (about 45 are visible) | `Tabilinks – grouped links on every new tab` | `Tabilinks – odkazy v skupinách na novej karte` |
| `extensionDescription` | 132 chars | `Your links on every new tab: grouped into workspaces, opened as tab groups, synced across your computers.` | `Vaše odkazy na každej novej karte: v skupinách a pracovných priestoroch, otvárané ako skupiny kariet, synchronizované.` |

---

## 1. Store listing tab

**Category:** Productivity → Workflow & Planning
**Language:** English (then add Slovak)

### Detailed description — English

```
Tabilinks replaces Chrome's empty new tab page with the links you actually use, arranged the way you work.

ORGANISED THE WAY YOU THINK
• Workspaces for separate parts of your life – work, home, a side project – each with its own columns of groups
• Groups and collapsible subgroups, with descriptions where a name is not enough
• Drag and drop links, subgroups and whole groups to rearrange them
• Several profiles, each with its own workspaces and settings

TABS, NOT JUST LINKS
• Open a whole subgroup at once as a Chrome tab group, in the colour you chose for it
• Let a subgroup catch its links: open one of them anywhere and it joins that subgroup's tab group
• Recently closed tabs in a slim panel on the right – reopen one with a click, or drag it into a group to keep it

SAVE A PAGE IN TWO CLICKS
• The toolbar button, Alt+Shift+D, or a right-click on a page or a link opens a small form: pick the group, done

A NEW TAB THAT STAYS OUT OF THE WAY
• A search bar using your browser's search engine or one you choose
• Adjustable size, English and Slovak, dates in your local format
• Short tips at the bottom, which you can switch off

YOUR DATA
• Works fully without an account – everything stays in your browser
• Export and import profiles to a file at any time
• With a free Tabilinks account, your links are backed up and synced across all your computers

FREE AND PREMIUM
Tabilinks is free. The free version shows a small banner at the bottom of the new tab page. Premium removes the banner, raises the limits on workspaces, profiles and synced installations, and lets you set your own background picture. See https://tabilinks.app for details.

PRIVACY
Without an account nothing leaves your browser except an anonymous daily count of opened new tabs, which cannot be linked to you. With an account, your links and recently closed tabs are stored so they can be synced. No data is sold or used for advertising. Full policy: https://tabilinks.app/privacy
```

### Detailed description — Slovak

```
Tabilinks nahradí prázdnu novú kartu Chromu odkazmi, ktoré naozaj používate, usporiadanými tak, ako pracujete.

USPORIADANÉ PODĽA VÁS
• Pracovné priestory pre rôzne časti života – práca, domov, vedľajší projekt – každý s vlastnými stĺpcami skupín
• Skupiny a zbaliteľné podskupiny, s popisom tam, kde názov nestačí
• Odkazy, podskupiny aj celé skupiny presúvate myšou
• Viac profilov, každý s vlastnými pracovnými priestormi a nastaveniami

KARTY, NIE LEN ODKAZY
• Otvorte celú podskupinu naraz ako skupinu kariet Chromu vo farbe, ktorú ste jej vybrali
• Podskupina môže „chytať“ svoje odkazy: otvorte niektorý z nich kdekoľvek a zaradí sa do jej skupiny kariet
• Nedávno zatvorené karty v úzkom paneli vpravo – jedným klikom ich znova otvoríte, alebo ich myšou presuňte do skupiny

ULOŽTE STRÁNKU NA DVA KLIKY
• Tlačidlo na lište, Alt+Shift+D alebo pravé tlačidlo myši na stránke či odkaze otvorí malý formulár: vyberiete skupinu a hotovo

NOVÁ KARTA, KTORÁ NEZAVADZIA
• Vyhľadávanie cez vyhľadávač prehliadača alebo ten, ktorý si zvolíte
• Nastaviteľná veľkosť, slovenčina a angličtina, dátumy v miestnom formáte
• Krátke tipy v spodnej časti, ktoré môžete vypnúť

VAŠE DÁTA
• Funguje úplne bez účtu – všetko zostáva vo vašom prehliadači
• Profily kedykoľvek exportujete a importujete zo súboru
• S bezplatným účtom Tabilinks sú vaše odkazy zálohované a synchronizované na všetkých vašich počítačoch

ZADARMO A PREMIUM
Tabilinks je zadarmo. Bezplatná verzia zobrazuje v spodnej časti novej karty malý banner. Premium banner odstráni, zvýši limity pracovných priestorov, profilov a synchronizovaných inštalácií a umožní nastaviť vlastný obrázok na pozadí. Podrobnosti na https://tabilinks.app

SÚKROMIE
Bez účtu neopúšťa váš prehliadač nič okrem anonymného denného počtu otvorených nových kariet, ktorý sa s vami nedá spojiť. S účtom sa vaše odkazy a nedávno zatvorené karty ukladajú, aby sa dali synchronizovať. Žiadne dáta nepredávame ani nepoužívame na reklamu. Celé zásady: https://tabilinks.app/privacy
```

### Graphics

| Asset | Size | Status |
|---|---|---|
| Store icon | 128×128 PNG | have it: `public/icons/icon-128.png` |
| Screenshots | 1280×800 (or 640×400), 1–5 | **to make** |
| Small promo tile | 440×280 | **to make** |
| Marquee promo tile | 1400×560 | optional |

Suggested screenshots, in this order (the first one is what most people see):
1. A full workspace: three or four groups, one subgroup with a tab-group colour stripe — the example set from "Load examples" is a good start
2. The recently closed tabs panel open beside the columns
3. The bookmarking popup over a website
4. A subgroup opened as a coloured Chrome tab group
5. The settings dialog

Small promo tile: the logo and one line — "Your links on every new tab".

### Links
- Official URL / homepage: `https://tabilinks.app`
- Support URL: `https://tabilinks.app` (or a support e-mail address)

---

## 2. Privacy tab

### Single purpose
```
Tabilinks replaces the new tab page with the user's own links, organised into workspaces, groups and subgroups, and helps open and save them as browser tabs.
```

### Permission justifications

| Permission | Justification to paste |
|---|---|
| `storage` | `Stores the user's workspaces, groups, links and settings locally in the browser, and the sign-in session when the user has an account.` |
| `tabs` | `Reads the address and title of the current tab when the user saves it as a link, keeps the "recently closed tabs" panel (address and title of a tab when it closes), and moves a tab opened from a saved link into that link's tab group.` |
| `tabGroups` | `Opens a subgroup of links as a Chrome tab group with its name and colour, finds that group again to add newly opened links to it, and repaints it when the user changes the colour.` |
| `contextMenus` | `Adds "Bookmark this page with Tabilinks" and "Bookmark this link with Tabilinks" to the right-click menu, which open the extension's bookmarking popup.` |
| `favicon` | `Shows each saved link with its website icon, using Chrome's own favicon cache.` |
| `search` | `The search bar on the new tab page can send the query to the browser's default search engine through chrome.search.` |
| Host permission `<all_urls>` | `Saved links can point to any website. When Chrome has no cached icon for a link, the extension downloads that page's HTML and its icon file to display the icon next to the link. No page content is stored or sent anywhere; only the icon image is kept locally. The same access is used to reach the extension's own sync server (api.tabilinks.app).` |

### Remote code
**No, I am not using remote code.**
(The ad banner is a cross-origin `<iframe>` of tabilinks.app shown in the page; no remotely loaded script runs in the extension.)

### Data usage — tick these
- [x] **Personally identifiable information** — e-mail address and username, only when the user creates or signs in to an account
- [x] **Authentication information** — the password at sign-in and the session tokens
- [x] **Web history** — recently closed tabs (address, title) are synced to the account when signed in
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
The extension works without an account: open a new tab and click "Load examples" on the first screen to get sample workspaces, groups and links.

To test synchronisation, sign in from the menu (three dots, top right) with this test account:
  username: <reviewer account>
  password: <password>
Sign in on a second Chrome profile with the same account to see the links appear there.

The banner at the bottom is our own premium offer, loaded from https://tabilinks.app/slot/workspace-footer.html.
```
Create a dedicated reviewer account for this, and do not reuse your own.
