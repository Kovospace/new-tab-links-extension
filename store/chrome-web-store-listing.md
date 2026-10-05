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

Tabilinks replaces the empty new tab page with the links you actually open and use – arranged into workspaces and groups of your own, alongside the history of the tabs you closed.

WHY TABILINKS
• Saves time – no typing addresses, no digging through bookmark folders. Open a new tab and your link is one click away. A whole subgroup opens with one click too, even straight into a tab group
• Saves space – your links live on the new tab, so you can switch the bookmarks bar off and give that height back to the page
• One account, every browser – your links follow you not only between computers but between browsers: save a link in Chrome and have it in Brave, Edge and others too
• Easy to use – links, subgroups and whole groups are moved with drag and drop
• Organised the way you think – profiles for your roles such as work and home, workspaces for the topics within them, tab groups for the pages you open
• Independent – no big-tech account needed, and it works fully without any account at all. Made by an independent developer; your data is never sold or used for advertising

WHAT IT DOES

ORGANISED THE WAY YOU THINK
• Profiles for the roles you play – one for work, one for home – each with its own workspaces and settings. Switch roles with one click instead of signing in to another account; export, import and manage profiles from the same menu
• Workspaces for the topics within a role – at home "Garage", "Band" and "Development", at work "Testing", "Production" and "Customer 1" – each with its own columns of groups
• Groups and subgroups inside a workspace, with a description where a name is not enough – in a "Garage": parts sellers, veteran clubs, forums, and a subgroup for each vehicle
• Roll a subgroup up with a click on its title: only the number of hidden links stays, and it stays that way on all your devices
• Drag and drop links, subgroups and whole groups to rearrange them, or drop a link into the trash

TABS, NOT JUST LINKS
• Open a whole subgroup at once as a Chrome tab group, in the colour you chose for it
• Let a subgroup catch its links: open one of them anywhere and it joins that subgroup's tab group
• Recently closed tabs in a slim panel on the right – reopen one with a click, or drag it into a group to keep it

SAVE A PAGE IN TWO CLICKS
• Right-click a page or a link and pick a group or subgroup of your workspace straight from the menu – saved, no form to fill in
• Or use the toolbar button or Alt+Shift+D for a small form where you can rename the link or choose another workspace first

A NEW TAB THAT STAYS OUT OF THE WAY
• A search bar that uses your browser's default search engine – or Google, DuckDuckGo or Bing if you choose one. What you type goes only to that search engine
• Adjustable size, English and Slovak, dates in your local format
• Short tips at the bottom, which you can switch off

YOUR DATA
• Works fully without an account – everything stays in your browser
• Export and import profiles to a file at any time
• With a free Tabilinks account, your links are backed up and synced across all your computers

FREE AND PREMIUM
Tabilinks is free. The free version shows a small banner at the bottom of the new tab page. Premium removes the banner, raises the limits on workspaces, profiles and synced installations, and lets you set your own background picture. See https://tabilinks.app for details.

PRIVACY
Without an account, your links and settings never leave your browser, and nothing is sent to us except an anonymous daily count of opened new tabs, which cannot be linked to you. To show icons, the extension asks the linked websites for their favicons, and the banner at the bottom of the free version is loaded from tabilinks.app. With an account, your links and recently closed tabs are stored so they can be synced. No data is sold or used for advertising. Full policy: https://tabilinks.app/privacy
```

### Detailed description — Slovak

```
Nová karta, ktorá konečne k niečomu je.

Tabilinks nahradí prázdnu novú kartu odkazmi, ktoré naozaj otvárate a používate – usporiadanými do pracovných priestorov a skupín podľa vás, spolu s históriou zatvorených kariet.

PREČO TABILINKS
• Šetrí čas – žiadne písanie adries ani hľadanie v priečinkoch záložiek. Otvoríte novú kartu a odkaz máte na jeden klik. Jedným klikom otvoríte aj celú podskupinu, dokonca rovno do skupiny kariet
• Šetrí miesto – odkazy máte na novej karte, takže lištu so záložkami môžete pokojne vypnúť a stránke vrátiť jej výšku
• Jeden účet pre všetky prehliadače – odkazy vás sledujú nielen medzi počítačmi, ale aj medzi prehliadačmi: uložíte odkaz v Chrome a máte ho aj v Brave, Edge a ďalších
• Jednoduché ovládanie – odkazy, podskupiny aj celé skupiny presúvate myšou
• Usporiadané podľa vás – profily pre vaše role ako práca a domov, pracovné priestory pre témy v rámci nich, skupiny kariet pre stránky, ktoré otvárate
• Nezávislé – nepotrebujete účet u žiadnej veľkej technologickej firmy a funguje úplne aj bez akéhokoľvek účtu. Vytvára ho nezávislý vývojár; vaše dáta nikdy nepredávame ani nepoužívame na reklamu

ČO TO VIE

USPORIADANÉ PODĽA VÁS
• Profily pre role, ktoré v živote máte – jeden pre prácu, jeden pre domov – každý s vlastnými pracovnými priestormi a nastaveniami. Rolu prepnete jedným klikom namiesto prihlasovania do iného účtu; v tom istom menu profily aj exportujete, importujete a spravujete
• Pracovné priestory pre témy v rámci roly – doma „Garáž“, „Hudba“ a „Vývoj“, v práci „Testovanie“, „Produkcia“ a „Zákazník 1“ – každý s vlastnými stĺpcami skupín
• Skupiny a podskupiny v pracovnom priestore, s popisom tam, kde názov nestačí – v „Garáži“: predajcovia dielov, veteránske kluby, fóra a podskupina pre každé vozidlo
• Podskupinu zbalíte kliknutím na jej názov: zostane len počet skrytých odkazov a zostane zbalená na všetkých vašich zariadeniach
• Odkazy, podskupiny aj celé skupiny presúvate myšou, a odkaz môžete pustiť rovno do koša

KARTY, NIE LEN ODKAZY
• Otvorte celú podskupinu naraz ako skupinu kariet Chromu vo farbe, ktorú ste jej vybrali
• Podskupina môže „chytať“ svoje odkazy: otvorte niektorý z nich kdekoľvek a zaradí sa do jej skupiny kariet
• Nedávno zatvorené karty v úzkom paneli vpravo – jedným klikom ich znova otvoríte, alebo ich myšou presuňte do skupiny

ULOŽTE STRÁNKU NA DVA KLIKY
• Kliknite pravým tlačidlom na stránku alebo odkaz a vyberte skupinu či podskupinu pracovného priestoru priamo z menu – uložené, bez vypĺňania formulára
• Alebo použite tlačidlo na lište či Alt+Shift+D: otvorí sa malý formulár, v ktorom môžete odkaz najprv premenovať alebo zvoliť iný pracovný priestor

NOVÁ KARTA, KTORÁ NEZAVADZIA
• Vyhľadávanie cez predvolený vyhľadávač prehliadača – alebo cez Google, DuckDuckGo či Bing, ak si niektorý zvolíte. Čo napíšete, ide len do tohto vyhľadávača
• Nastaviteľná veľkosť, slovenčina a angličtina, dátumy v miestnom formáte
• Krátke tipy v spodnej časti, ktoré môžete vypnúť

VAŠE DÁTA
• Funguje úplne bez účtu – všetko zostáva vo vašom prehliadači
• Profily kedykoľvek exportujete a importujete zo súboru
• S bezplatným účtom Tabilinks sú vaše odkazy zálohované a synchronizované na všetkých vašich počítačoch

ZADARMO A PREMIUM
Tabilinks je zadarmo. Bezplatná verzia zobrazuje v spodnej časti novej karty malý banner. Premium banner odstráni, zvýši limity pracovných priestorov, profilov a synchronizovaných inštalácií a umožní nastaviť vlastný obrázok na pozadí. Podrobnosti na https://tabilinks.app

SÚKROMIE
Bez účtu vaše odkazy a nastavenia nikdy neopustia prehliadač a nám sa neposiela nič okrem anonymného denného počtu otvorených nových kariet, ktorý sa s vami nedá spojiť. Na zobrazenie ikon si rozšírenie pýta favicony od webov, na ktoré odkazy vedú, a banner v spodnej časti bezplatnej verzie sa načítava z tabilinks.app. S účtom sa vaše odkazy a nedávno zatvorené karty ukladajú, aby sa dali synchronizovať. Žiadne dáta nepredávame ani nepoužívame na reklamu. Celé zásady: https://tabilinks.app/privacy
```

### Graphics

| Asset | Size | Status |
|---|---|---|
| Store icon | 128×128 PNG | have it: `public/icons/icon-128.png` |
| Screenshots | 1280×800 (or 640×400), 1–5 | have three: `store/materials/screenshots/1-3.png` (24-bit, no alpha) |
| Small promo tile | 440×280 | have it: `store/materials/promo/small-promo-tile.png` (source: `small-promo-tile.html`) |
| Marquee promo tile | 1400×560 | optional - skipped for the first release; only used if Google features the extension |

Suggested screenshots, in this order (the first one is what most people see):
1. A full workspace: three or four groups, one subgroup with a tab-group colour stripe — the example set from "Load examples" is a good start
2. The recently closed tabs panel open beside the columns
3. The right-click submenu over a website: workspace name, groups, a group's subgroups
   (the most distinctive feature; the bookmarking popup can be a sixth candidate if one is dropped)
4. A subgroup opened as a coloured Chrome tab group
5. The settings dialog

Small promo tile: the logo, the website's wordmark and "Your bookmarks, grouped, on every new tab".

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
| `contextMenus` | `Adds "Bookmark this page with Tabilinks" and "Bookmark this link with Tabilinks" to the right-click menu. Each is a submenu listing the groups and subgroups of the user's open workspace; choosing one saves the page or the link there. The last entry opens the extension's bookmarking popup instead.` |
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
