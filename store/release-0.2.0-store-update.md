# Chrome Web Store update — version 0.2.0

Everything to change for the 0.2.0 upload, gathered from four board tasks:

| Task | What it is about |
|---|---|
| [frontend#50](https://github.com/Kovospace/new-tab-links-frontend/issues/50) | Browsing history (#74): disclosures, permission justification, single purpose |
| [frontend#52](https://github.com/Kovospace/new-tab-links-frontend/issues/52) | Closed tabs can now be turned off (#72) |
| [frontend#54](https://github.com/Kovospace/new-tab-links-frontend/issues/54) | The open tabs card (#73) - local only |
| [frontend#55](https://github.com/Kovospace/new-tab-links-frontend/issues/55) | Marketing texts: shorter, aligned with the website, AI-readable, links incl. the comparison |

What 0.2.0 adds, for reference: a side panel with three cards - **Open** tabs of this browser
(never leave it), **Closed** tabs (recorded by default, can be turned off) and **History** of
visited pages (off by default; 50 free / 1000 premium; synced when on) - and a new
**Settings → Privacy** section holding both switches. Turning either off deletes what it
recorded, here and on the account. Plus the exact time beside "X ago" (#75).

**What does not change:** the manifest's permissions. Nothing new is requested, so users get
no re-consent prompt and the extension is not disabled on update - which is exactly why the
listing and the privacy policy are the only place users are told, and why they have to be right
before the upload.

---

## 0. Order of work

1. [ ] **Deploy** migrations 0.0.18, then the backend (history needs the `visit` table). The
       extension works against the old backend too - it just does not sync history - but the
       store reviewer will try it.
2. [ ] **Publish the privacy policy changes** on tabilinks.app (section 1). The reviewer reads it.
3. [ ] Optionally merge the website PR with the new limit row (frontend#56).
4. [ ] Update `store/chrome-web-store-listing.md` with sections 2-5, so the repo stays the source.
5. [ ] Paste into the Developer Dashboard (sections 2-6).
6. [ ] Upload `tabilinks.zip` (version 0.2.0, manifest at the root of the zip).
7. [ ] Close #50, #52, #54, #55.

---

## 1. Privacy policy (website: `public/content/legal/{en,sk}/privacy.md`)  — #50, #52

Update the effective date at the top (it is a placeholder, `{effectiveDate}`).

### 1a. "Using the extension without an account" — add a paragraph after the existing one

EN:
```markdown
The side panel on the new tab page lists the tabs open in your browser; that list is read from
the browser when the panel is drawn and is never stored or sent anywhere. Recently closed tabs
are recorded by default, and browsing history only if you turn it on; both are kept in your
browser's storage, and both can be turned off in Settings → Privacy, which also deletes what was
recorded. Incognito windows are not recorded unless you allow the extension there.
```

SK:
```markdown
Bočný panel na novej karte zobrazuje karty otvorené vo vašom prehliadači; tento zoznam sa číta
z prehliadača pri vykreslení panela a nikde sa neukladá ani neodosiela. Nedávno zatvorené karty
sa zaznamenávajú predvolene, história prehliadania len ak ju zapnete; oboje sa uchováva v
úložisku vášho prehliadača a oboje sa dá vypnúť v Nastaveniach → Súkromie, čím sa zaznamenané
údaje aj vymažú. Okná v režime inkognito sa nezaznamenávajú, pokiaľ tam rozšírenie nepovolíte.
```

### 1b. "What we process when you have an account" — replace the "Your synchronised content" row

EN:
```markdown
| Your synchronised content: workspaces, profiles, groups, links, their titles and descriptions; recently closed tabs (address, title, icon address, device name, time closed) unless you turned them off; and, only if you turned it on, your browsing history - the most recent visited pages (address, title, icon address, device name, time visited), at most 50 on a free account and 1000 on premium. The tabs currently open in your browser are never sent | The synchronisation and backup you use the account for | Contract, Art. 6(1)(b) |
```

SK:
```markdown
| Váš synchronizovaný obsah: pracovné priestory, profily, skupiny, odkazy, ich názvy a popisy; nedávno zatvorené karty (adresa, názov, adresa ikony, názov zariadenia, čas zatvorenia), pokiaľ ste ich nevypli; a len ak ste ju zapli, vaša história prehliadania - naposledy navštívené stránky (adresa, názov, adresa ikony, názov zariadenia, čas návštevy), najviac 50 pri bezplatnom účte a 1000 pri premium. Karty práve otvorené vo vašom prehliadači sa nikdy neodosielajú | Synchronizácia a záloha, na ktoré účet používate | Zmluva, čl. 6 ods. 1 písm. b) |
```

(Align the SK row's last two columns with the wording already in `sk/privacy.md`.)

### 1c. "How long we keep data" — add a bullet

EN:
```markdown
- Recently closed tabs and browsing history roll: the oldest entries are deleted as new ones
  arrive. Turning either off in Settings → Privacy deletes it at once, on every device and on
  our servers.
```

SK:
```markdown
- Nedávno zatvorené karty a história prehliadania sa priebežne obmieňajú: najstaršie záznamy sa
  mažú, ako pribúdajú nové. Vypnutím ktoréhokoľvek v Nastaveniach → Súkromie sa vymaže hneď, na
  všetkých zariadeniach aj na našich serveroch.
```

---

## 2. Privacy tab

### 2a. Single purpose — #50, #54

```
Tabilinks replaces the new tab page with the user's own links, organised into profiles, workspaces, groups and subgroups, together with the user's open tabs, recently closed tabs and - when the user turns it on - recently visited pages, and helps open and save them as browser tabs.
```

### 2b. Permission justification for `tabs` — #50, #52, #54 combined

```
Reads the address and title of tabs to: save the current tab as a link; show the tabs open in this browser in a panel on the new tab page, where they can be switched to, closed or saved as links (this list is never stored or sent anywhere); keep the "recently closed tabs" list (address and title of a tab when it closes; on by default); keep the browsing history list (address, title and time of pages visited; off by default, only when the user turns it on); and move a tab opened from a saved link into that link's tab group. Closed tabs and browsing history are synced to the user's account only when signed in, and both can be turned off in Settings → Privacy, which also deletes them.
```

The other justifications (`storage`, `tabGroups`, `contextMenus`, `favicon`, `search`, `<all_urls>`)
stay as they are.

### 2c. Data usage — #50

- [x] **Personally identifiable information** — unchanged
- [x] **Authentication information** — unchanged
- [x] **Web history** — already ticked. Note in the listing file becomes:
  *recently closed tabs (on by default) and, if the user turns it on, visited pages (address,
  title, time, device name) are synced to the account when signed in; both can be turned off in
  Settings → Privacy*
- [ ] **User activity** — stays **unticked** (no clicks, keystrokes or network monitoring)
- Re-confirm the three certifications.

---

## 3. Store listing — detailed descriptions — #55 (with #50, #52, #54 folded in)

Rewritten per #55: shorter than 0.1.0's, in the order the website pitches it (who it is for,
why it is better, what it does), written as plain factual statements so that search engines
and AI assistants can quote it correctly, and linking the website, the comparison, the fair use
policy and the privacy policy. Store limit is 16 000 characters; both are well under.

### English

```
A new tab that finally does something useful.

Tabilinks replaces the empty new tab page with your own links, organised into a logical hierarchical structure of Workspaces, their Groups and optional Subgroups, all within switchable Profiles.

As a bonus, the history of visited pages, recently closed tabs and the list of currently open tabs - all accessible without a single click: just hover the mouse over the panel on the right side.

Of course, everything mentioned can be backed up and synchronised across all your browsers and devices.

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
- your own background image

*UNLIMITED under the fair use policy (https://tabilinks.app/fair-use)
- generous limits: we expect 99.99% of users never to reach them
- if you somehow do, write to us and explain your use case so we can make it work for you

PRIVACY

Without an account your links never leave your browser; only an anonymous daily count of opened new tabs is sent. Open tabs are never stored or sent. Closed tabs are recorded by default and browsing history only when you turn it on - both can be switched off in Settings → Privacy, which also deletes them. With an account, your links, closed tabs and (if on) history are stored to sync them. Full policy: https://tabilinks.app/privacy

OTHER

How Tabilinks compares with other new tab extensions: https://tabilinks.app/compare
Website: https://tabilinks.app
```

### Slovak

```
Nová karta, ktorá konečne k niečomu je.

Tabilinks nahradí prázdnu novú kartu vašimi vlastnými odkazmi, usporiadanými do logickej hierarchickej štruktúry: pracovné priestory, v nich skupiny a voliteľné podskupiny, a to všetko v rámci prepínateľných profilov.

Ako bonus história navštívených stránok, nedávno zatvorené karty a zoznam práve otvorených kariet - všetko dostupné bez jediného kliknutia: stačí prejsť myšou nad panel na pravej strane.

Samozrejme, všetko spomenuté sa dá zálohovať a synchronizovať naprieč všetkými vašimi prehliadačmi a zariadeniami.

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
- vlastný obrázok na pozadí

*NEOBMEDZENÉ v rámci zásad primeraného používania (https://tabilinks.app/sk/fair-use)
- štedré limity: očakávame, že 99,99 % používateľov na ne nikdy nenarazí
- ak ich predsa dosiahnete, napíšte nám a vysvetlite svoj prípad, aby sme to pre vás vyriešili

SÚKROMIE

Bez účtu vaše odkazy nikdy neopustia prehliadač; posiela sa len anonymný denný počet otvorených nových kariet. Otvorené karty sa nikdy neukladajú ani neodosielajú. Zatvorené karty sa zaznamenávajú predvolene, história prehliadania len keď ju zapnete - oboje sa dá vypnúť v Nastaveniach → Súkromie, čím sa aj vymaže. S účtom sa vaše odkazy, zatvorené karty a (ak je zapnutá) história ukladajú, aby sa dali synchronizovať. Celé zásady: https://tabilinks.app/sk/privacy

ĎALŠIE

Porovnanie Tabilinks s inými rozšíreniami novej karty: https://tabilinks.app/sk/compare
Web: https://tabilinks.app/sk
```

Check before pasting: the prices are deliberately not in the text (they change; the website has
them), and the limits match `PlanLimits.ts` and the website's plan table. Every
address used exists in both languages (`/compare`, `/privacy`, `/fair-use`; Slovak under `/sk/`).

### Name and summary (`public/_locales/<lang>/messages.json`) — optional, #55

The store reads these from the package, so changing them needs a new zip. Current ones still fit;
if you want the summary to mention the panel:

| Key | en | sk |
|---|---|---|
| `extensionDescription` (≤132) | `Your links on every new tab, in profiles, workspaces and groups - with open tabs, closed tabs and history, synced across browsers.` | `Vaše odkazy na každej novej karte v profiloch a skupinách - s otvorenými a zatvorenými kartami a históriou, synchronizované.` |

Both are within the limit (130 and 124 characters).

---

## 4. Graphics — yours, listed for completeness

- Screenshots: the side panel with each card (Open, Closed, History grouped by day) and
  Settings → Privacy are new things worth showing. Five at most.
- Small promo tile: unchanged unless the tagline changes.

---

## 5. Test instructions tab — #50, #52, #54

```
The extension works without an account: open a new tab and click "Load examples" on the first screen to get sample workspaces, groups and links.

The panel on the right edge opens when the pointer rests on it. It has three cards: Open (tabs open in this browser), Closed (recently closed tabs) and History. Browsing history is off by default: turn it on in the menu (three dots, top right) → Settings → Privacy, then visit a few pages and open a new tab. Turning either switch off there asks for confirmation and deletes what was recorded.

To test synchronisation, sign in from the menu with this test account:
  username: <reviewer account>
  password: <password>
Sign in on a second Chrome profile with the same account to see links, closed tabs and history appear there.

The banner at the bottom is our own premium offer, loaded from https://tabilinks.app/slot/workspace-footer.html.
```

---

## 6. Package

- `tabilinks.zip` in the repo root: version **0.2.0**, built from `main` with #72-#75 merged,
  `manifest.json` at the root of the zip (0.1.0's zip had it under `dist/`).
- Rebuild it if anything in `public/_locales` changes (section 3, name and summary):
  `npm run build && rm -f tabilinks.zip && (cd dist && zip -qr -X ../tabilinks.zip .)`
- Expect a manual review: changes to how web history is handled are usually looked at by a
  person, so plan for days rather than hours.
