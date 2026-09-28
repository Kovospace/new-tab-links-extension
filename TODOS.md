# TODOs

Note for agents: 
- each task into its feature branch
- if makes logical sense, each root level bullet should be 1 commit
- after doing the task, move to done


## Features that must be done before release

### [medium] Usage statistics and ad slot - IN PROGRESS across four repos
Branch `feature/usage-stats-and-ad-slot` in every repo.
- extension: DONE - the ad slot frames tabilinks.app/slot/workspace-footer.html and shows it only
  once the page posts "tabilinks-ad-slot-ready"; new tabs are counted by local day in the service
  worker and reported every 15 minutes (the server can change that) to POST /api/v1/stats/new-tabs
- migrations: daily_metric and website_visitor_hash tables
- backend: the new-tabs and website-visit endpoints, the admin metrics endpoint, nightly cleanup
- frontend: the static slot page with its headers, the human-visitor signal, and an admin page
  with two graphs - new tabs and website visitors, never combined
- before release: mention the anonymous count in the store listing and the privacy policy
- extension: DONE - no slot for a premium account (not even its space, and the frame is never
  loaded), and no "Upgrade to premium" in its menu. Read from GET /api/v1/users/me ("premium",
  judged by the server), remembered per account so no ad flashes, re-asked every 30 minutes and
  on the next tab after "Upgrade to premium" is clicked

### [big] Add panel (or section) with currently opened tabs
Note: needs permission "chrome.session"
- should be located on the right
- distinguish somehow which links are already added in current profile
- simple adding by drag and drop
    - on drop, open link add dialog with pre-filled values
- check if it is possible to somehow change behaviour of CTRL+D shortcut and set it as replacement for browser bookmarks
  manager - NO it is not
- now recently closed is already implemented - split this panel into recently closed and currently openes section


## TODO BUGFIX

### [small] The seeded data does not type-check
- `npx tsc --noEmit` reports five errors in src/backend/datasource/init/AppStateInit.ts: the
  groups, subgroups and links the first run is seeded with have no `createdAt`, which the
  entities require
- the build does not notice, because Vite transpiles rather than type-checks, and a seeded
  record without it is written to storage as it stands
- so the whole strict check is unusable until it is fixed - which is what it costs: nothing
  else it would catch can be seen while these five are in the way


## TO BE approved / analyzed

### [big] History panel
Note: chrome.history permission can be problematic when submitting to chrome store
- containing 2 tabs:
  - last closed tabs
  - most visited links (not bookmarked yet)


# DONE

### [medium] Synced links have no icons in the second browser
- not a missing sync step: every drawn link already asks the worker for its icon. The lookup
  failed on a browser that had never visited the page, and the placeholder was then stored as
  if it were the icon - so nothing ever asked again, and only "Refresh icon" got past it
- a miss is now stored as a miss, with the time it happened. Chrome's own favicon cache is
  asked on every draw of a link without an icon (local and cheap, and it fills the moment the
  page is visited here); the page itself is fetched again at most every 6 hours per link, so a
  new tab page does not send a request for every iconless link it draws
- that retry on draw is also the "go through the links of the current workspace without an
  icon on every new tab" idea - a new tab page draws exactly those, so no separate event
- the HTML fallback never worked: it used DOMParser, which a service worker does not have, so
  only /favicon.ico was ever tried. The `<link rel="icon">` tags are now read without a DOM
  (faviconCandidates.ts), which is what finds the icon of a page this browser never visited
- placeholders stored by the old code are read as misses already due, so existing installs
  heal on the next new tab without anyone pressing "Refresh icon"
- 12 tests; the placeholder and the DOMParser ones were run against the old worker and fail

### [small] Add "upgrade to premium" to app menu (three dots upper right corner)
- shown only when signed in, right after the synchronisation status line
- opens the website's account settings (WEBSITE_PATHS.accountSettings, "/account") in a new
  tab, because that is where the upgrade is offered - the extension takes no payment itself
- shown to every signed-in account for now: nothing tells the extension yet whether an account
  already is premium, so hiding it for one needs the backend to say so first

### [important]
- rebranding application as Tabilinks
- will buy domain tabinlinks.net or tabilinks.com

### [BIG] i18n
- every sentence the interface says is in `src/i18n/locales/<language>/<area>.json`, split the
  way the screens are - workspace, group, subgroup, link, profiles, settings, closedTabs,
  bookmark, tips, firstRun, sync - with what several screens say in the same words in the file
  named after the thing rather than copied into each: common (the buttons every dialog has),
  dialogs (the input dialog and its validation), errors (the account), dates
- the file's name is the first segment of every key, so `t("subgroup.menu.addLink")` says where
  its wording lives. Imported rather than fetched, like the tips already were: a malformed file
  is a build error, and `t()` can answer synchronously - which every component needs, because
  rendering here is not asynchronous
- Slovak throughout, and plurals go through `Intl.PluralRules` rather than `count === 1`:
  Slovak wants a different word for two, three and four than for five, and English needs "an
  hour ago" where the naive rule says "1 hours ago"
- the language is guessed from the browser and falls back to English for a language we do not
  have. "Follow the browser" is stored as its own value rather than as the guessed language,
  because the two mean different things - a browser that changes language later is followed by
  the first and ignored by the second
- "Language & local customs" in Settings, holding the language and the date format. Both are
  DEVICE preferences, beside the size slider and not on the profile record: one person's two
  browsers are routinely set to two languages, and `ProfileSettings` is booleans that would
  each need a backend column, a snapshot field and a merge rule
- the date format is a separate question from the language on purpose. The language picks the
  words, the format picks the order the parts of a date go in, and "local custom" - the default
  - takes that order from the browser's own region. A Slovak reader on an American team can
  have Slovak words and 9/3/2026
- changing the language reloads the page, which is the only honest way to redraw an interface
  whose every string was read while it was being built. The settings dialog leaves a note in
  session storage and main.ts opens it again, so setting a language and then a date format is
  one journey through the menu rather than two
- `InputDialog` fields now declare the key their value reaches the callback under. They used to
  be the label camel-cased, which was fine with one wording per field and became a bug with
  two: a Slovak dialog would have handed `addWorkspace` a `nazovPracovnehoPriestoru`
- the service worker's two right-click entries are translated as well, which cost it a read of
  the device preferences and a rebuild when they change - Chrome keeps a context menu entry
  until it is told otherwise, so one created in English would still say so months later
- `public/_locales/` and `default_locale` translate what our own runtime cannot reach: the
  extension's name and description, the toolbar tooltip and the keyboard shortcut's description
  on chrome://extensions/shortcuts. Those follow the BROWSER's language, not this setting, and
  that split is the browser's rather than ours
- NOT translated, deliberately: the automatic device label ("Browser extension on <platform>").
  It is an identifier - stored on the account, shown on devices reading in another language,
  and compared as a string against what the worker stamped, which has no chosen language behind
  it. Translating it would rename a device whenever its owner changed language
- 33 tests over the new layer plus a completeness test that names any key one language has and
  another does not, and checks that a translation uses the same `{placeholders}`. Five of the
  new tests were run against the defect they name and watched to fail

### [medium] Add trash bin for links
- the tips bar at the foot of the workspace turns red while a link is being dragged, says
  "Drop the link here to destroy it" with a bin in front of it, and deletes what lands on it
- one bar with two faces rather than two bars, because what says "this is dangerous now" is
  the colour changing under something that was already there - and a colour cannot transition
  between two elements. Both faces are built at render; the stylesheet shows one, keyed off
  the kind of drag the root element names, so nothing in the bar listens for a drag
- the colour asked for was var(--color-danger), which does not exist. It uses
  --color-button-danger-background, the one the palette already has for a destructive
  surface, and --color-button-danger-background-hover while the link is actually over it
- links only. A subgroup carries its links with it and a group carries both, so dropping
  either would destroy a great deal on a single gesture; a closed tab is not destroyed here
  either, since the panel it comes from has its own way of forgetting one
- nothing is asked before the link goes, which is the bargain the delete button on a link and
  its context menu entry already make - and a question raised mid-drag could only be answered
  after the gesture that asked it had ended
- two things decided on the way and worth knowing: the bar is drawn for the trash even on a
  profile that has hidden tips (otherwise the bin quietly would not exist for anyone who
  pressed "hide tips"), and it is stuck to the bottom of the scrolling area while the link is
  in the air, because otherwise a workspace taller than the screen puts the bin below the fold
- five tests, each checked against the defect it names rather than against the feature being
  absent - including the one that says a group is refused, which was run against a bar that
  accepted groups

### [medium] the scrollbar is displayed on folded "last open tabs" panel
- the list scrolled whatever width the panel was, so a profile with more closed tabs than fit
  down the screen drew a scrollbar in a column two and a half characters wide - most of the
  column, and a control for a list that is not being shown
- it now scrolls only while the panel is open. Folded, the favicons past the bottom are
  clipped rather than reachable, which costs nothing: the pointer that would go looking for
  them unfolds the panel on the way
- CSS only, and not testable here - the suite runs in jsdom, which lays nothing out and loads
  no stylesheet

### [high] "last open tabs link ghost"
- the row's "+" and "x" are revealed by :focus-within as well as by :hover, because somebody
  arriving by keyboard has no pointer to reveal them with. But a press is a focus too: the
  row's title is a button, so dragging a row out of the panel left it focused
- that is the whole of the description. The actions stayed lit over the folded rail, came back
  lit the next time the panel opened with the pointer nowhere near them, and only went out
  when something else was clicked - which is what blurred them. An earlier attempt read it as
  an orphaned compositing layer and took the fade off the buttons; that was the wrong cause
- the panel now lets go of the focus as it folds. Folding is the right moment for it beyond
  this bug: a folded rail draws nothing that can be focused, so focus inside it is focus the
  user can neither see nor follow. A pinned panel is left alone - that one is being used, and
  by whoever the focus rule is for
- two tests, the first of which fails against the old code

### [high] "recently closed tabs" opens when dragging something
- the panel keeps its width while a row is dragged OUT of it - it is the source of that drag,
  and one that narrowed under the cursor would take the rest of the row out from under the
  thing being carried. That rule was keyed on "dnd-active", which the root element wears for
  every drag, so picking up a link, a subgroup or a group anywhere on the page unfolded it too
- and it stayed unfolded for the whole journey: no mousemove is delivered while a drag is in
  flight, and the pointer rule is the only thing that folds it again
- the root element now names what is being carried as well as that something is
  (data-dnd-kind), and the rule asks for a closed tab. One attribute, set and deleted beside
  the class that was already there
- pinned by a test that fails against the old code: dragging a link must name "link" and
  dragging a row "closedTab", and neither may leave the attribute behind

### [big] Drag & drop support
- all four: reorder links, link into or out of a subgroup, link between groups, and groups
  along the row
- HTML5 drag and drop rather than pointer maths - the browser already carries the thing, draws
  it, and knows when a drag was abandoned
- behind the "Enable drag & drop" setting, which now does something. The setting is read when a
  drag starts rather than when listeners are attached, so turning it on needs no rebuild and
  turning it off stops the next drag
- a drop onto a thing means "where this one is" - its group, its subgroup, its place - which is
  how a link crosses into a subgroup or another group without any of that being said
  separately. A drop onto a subgroup or a group body means "in here, at the end"
- before/after is read up and down for a link and left and right for a group, because groups
  are columns
- the index a drop names counts the sequence as drawn, which still holds the dragged item, so
  the repository takes one off when it moves down its own sequence; without that, dropping a
  link one place to the right moved it two
- subgroups are draggable too: within their group's sequence, which counts its root-level
  links, and into another group - where their own links go with them, since a link names its
  group as well as its subgroup and one left behind would be drawn by neither
- a link dropped on a subgroup's heading or description lands in that subgroup, at the end. It
  used to land in the group instead: a drop that nothing stopped reached the group behind the
  subgroup, and the outer handler ran last and won
- a closed tab can be dragged out of its panel onto a group, a subgroup, or between two links,
  and becomes a link there. It carries its address and title rather than an identifier, because
  what it makes is a new link and nothing in the workspace can look a closed tab up. The row
  stays in the panel, marked as kept

### [medium prioroty] Hovering over top panel into menu button causes "last closed tabs" to open
- the pointer rule read only x: at or right of the rail's left edge opened it. The rail is a
  column of the page grid and starts below the header, so that was true of the application menu
  and the settings button in the corner as well, and reaching for them opened the panel
- it now reads y too - beside the panel, not merely right of it - so the header and the footer
  leave it alone, and a pointer that wanders up out of the panel closes it
- three tests, each of which fails against the old one-comparison rule

### [critical] Sync event even on idle
- not polling and not the backend: SyncBaselineRepository.getFor rebuilt the baseline from the
  two fields it knew about, so the closed tabs it had just stored were dropped on every read.
  The device therefore believed the account had none and pushed the whole list again on every
  synchronisation; each push drew a change notification, the second browser pulled and pushed
  its own list back, and the two never ran out of things to say
- the fix is one line and a rule: the baseline is handed back whole, never field by field
- second cause behind it, found once the first was fixed: the pulled list was capped and
  deduplicated before being stored, and anything trimmed on the way in is a difference reported
  on every synchronisation. What the account holds is now stored exactly; the list is kept in
  bounds where it is recorded and made readable where it is drawn
- test/backend/sync/syncSettles.test.ts guards both from now on: it pushes into a fake account,
  serves the result back, and asserts the second synchronisation has nothing to say. Every
  other sync test asks what one synchronisation sends; this one asks whether they stop


### [medium] Do not mix tests with code
- every test moved to <project_root>/test, mirroring src: test/backend/sync/X.test.ts covers
  src/backend/sync/X.ts. Helpers - the chrome.storage stub and the profile fixtures - are in
  test/support
- vitest.config.ts and tsconfig.json updated; nothing in src imports anything under test
- found on the way, and fixed: src/main.ts was both the entry point and the module holding
  every element, action and class name, so importing one name pulled the bootstrap in with it.
  Any test touching a component quietly booted the whole application against a document with no
  workspace in it - two unhandled errors that vitest warns can mask a failure. The names are in
  src/constants.ts now and main.ts starts the page and does nothing else

### [small] Add "move up" and "move down" action to link context menu
- right-click a link: "Move up" and "Move down", above the entries that move it somewhere else,
  because these are the ones that do not change what it belongs to
- each is offered only when there is somewhere to go. A menu that offered "move up" on the
  first link and then ignored the click would be lying, and leaving the item out is the only
  way a menu has of saying "nowhere to go"
- the sequence asked is the one the group draws, so a root-level link is ordered against that
  group's subgroups too: "up" can mean past a whole subgroup, and the first link below one is
  not the first item

### [small] Space reserved for ads
- ui/partials/adsBar.ts and ui/styles/_adsBar.css, built like the tips bar is, drawn into
  <workspace-plane-footer> after it
- the footer is a column now, so what is declared after the tips is drawn under them. In a row
  the tips' own auto margins centre them and push everything else to the edge, which is where
  the ads bar had ended up
- div.ads-bar, flex and centred, named by data-ad-slot="workspace-footer" and aria-hidden so a
  screen reader skips it
- 64px high, 1em margin, the component background rather than #222 written out so it follows
  the panels around it if those are ever repainted
- it holds its space whether or not anything is in it: the day something lands there, nothing
  around it moves
- measured in pixels, alone on this page - an ad is sold as a fixed number of pixels, so a slot
  that grew with the size slider would crop it or leave a gap beside it
- the width is the one number that was not specified: 728px, the common banner. One number to
  change when the real one is known

### [medium] Add "size" to UI settings
- a slider in "UI and behavior" setting the root html font size, 0.625em to 1.5em in steps of
  0.0625em, shown as a percentage because "0.8125em" means nothing at a glance
- it acts while it is dragged, not on release: the thing it resizes is everything around it,
  including the dialog the slider is in, and that is how somebody knows which way to drag
- NOT synchronised, deliberately, and the first setting that is not: it lives on the device
  (DevicePreferencesRepository) because a desktop and a laptop want different answers and one
  should not decide for the other. Say the word if you would rather it travelled - it is a
  fourth backend column
- the value is clamped and snapped wherever it comes from, including storage: this number is
  the root font size, so a bad one does not make part of the page wrong, it makes the page
  unreadable with the control for fixing it on that same page
- the settings model now has two kinds of setting, a switch and a slider; adding either is
  still one line in the CATEGORIES list

### [small] Toggle last closed tab active class
- the header button wears "active" while the panel is being held open by it, and only then -
  widening on hover is not the button's doing and does not light it up
- the panel publishes whether it is pinned rather than the button remembering its own clicks:
  the panel lets go of itself when something outside it is clicked, when a row is opened, or
  when its own close button is pressed, and a button that only heard its own clicks would go
  on looking pressed after any of those

### [small] Show devide name in last closed tab row
- the row says where it happened on a third line of its own, under the title and the time, and
  only when that was not this device
- it was already written to do that and still showed nothing, because the worker stamped only
  the name the user had chosen - and nobody has to choose one. A row stamped with nothing
  cannot be told apart from a row closed here, which is the only question the panel asks of
  that field
- so the automatic label ("Browser extension on <platform>") is stamped when no name was
  chosen, and it is the same label the account already knows the device by: one function in
  sync/DeviceName.ts used by the request header, the worker and the panel, because the
  comparison only works if all three answer identically
- NOT solved, and cannot be here: two unnamed installations on the same platform produce the
  same label and so read as the same device. That is what naming a device is for

### [small] Extend subgroup color stripe to its links
- the colour bar moved from the subgroup's heading to the subgroup itself, so it runs past the
  links as well: on the heading alone it read as a decoration of the title rather than as a
  bracket around what belongs together
- one rule rather than one on the head and another on the body, so there is nothing to keep in
  step - and a collapsed subgroup shortens the bar for free, because the body it runs past is
  the thing that rolls up
- spacing between the bar and the content is whatever the subgroup's own padding is; margins
  left alone deliberately, as asked

### [big] Add panel with last opened tabs (closed tabs history)
- a rail down the right-hand edge, always there, showing the favicons of what was closed and
  widening to the full list when the pointer reaches it - no click to look
- it is a column of the page grid, so widening shrinks the link columns instead of covering
  them: nothing is dragged underneath it and it never sits on the header's buttons
- opening is decided from the pointer's position rather than :hover - at or right of the
  panel's left edge is open, left of it is closed - so crossing onto the scrollbar does not
  snap it shut
- the header button pins it open, which outranks the pointer; a pinned panel closes on unpin,
  on a click outside it, or when a row is opened
- rows are newest first, each with its favicon, title, how long ago, and the device it was
  closed on when that was another one
- the service worker records closures: chrome.tabs.onRemoved does not say what was closed, so
  the worker mirrors the open tabs in chrome.storage.session and reads the closure out of it.
  Session storage rather than memory, because MV3 stops the worker after thirty seconds
- stored under a key of the worker's own, never inside the profile's data: a worker writing
  the whole profile record back would undo whatever the page had just saved
- 50 per profile, deduplicated by address, and synchronised by profile - a new entity kind,
  the first since the original five. First contact joins the two lists rather than letting the
  account win: both are logs of things that really happened
- green folder mark on a row whose address this profile already keeps as a link, compared the
  way the tab catcher compares addresses
- saving one as a link reuses the bookmarking form in a dialog
- NOT done: drag & drop out of the panel, which waits on drag & drop existing at all
- NOT done: the backend table for this is on branch feature/closed-tabs and not merged yet, so
  the list stays on one device until that lands

### [small] add tips to the columns screen background
- tips live in src/ui/tips/tips.json as an array, one sentence per language per tip; adding a
  tip is adding an entry, and English is what everything falls back to
- drawn at the bottom of the workspace plane, inside the scrolling columns area rather than in
  the page footer: the footer is pinned, and a tip that is always on screen reads as furniture
- a random tip on every new tab open; previous / next arrows step through the rest, and the
  position is not remembered - storing it would mean the same tip every morning, and would
  make pressing an arrow a write to the account
- the arrows and the close button appear on hover (and on keyboard focus), the sentence alone
  when the pointer is elsewhere
- close asks first, and hiding is the profile setting "Hide tips" - so it follows the user to
  every device, and Settings is the way back, which is what the question says
- a tip with a "url" field gets a "tell me more" button. The url is per language, like the
  sentence, because the tutorial it points at is a page in a language; a language with no
  tutorial yet falls back to the English one. A path resolves against the website, so the
  tutorials pages can move without every tip being rewritten
- NOT done: no tutorials pages exist yet, so the one tip that has a url points at where they
  will be

### [medium] Custom color for tab group
- NOT as specced, and the reason is the browser: chrome.tabGroups.update() takes one of nine
  names - grey, blue, red, yellow, green, pink, purple, cyan, orange - and refuses anything
  else. Sixteen predefined colours, a colour wheel and a hex box could all be drawn, and the
  tab strip would go on painting something else. So the picker offers the nine Chrome honours,
  and says under the swatches that these are the only nine
- a new subgroup is given a colour nothing else in the profile uses, chosen at random; once
  all nine are taken, at random among the least used - the rule this asked for, over 9 not 16
- subgroup menu item "Grouped tabs color" with a filled circle in front of it showing the
  colour it is set to now
- the colour is used when opening all links from a subgroup, and when the background catcher
  pulls a single tab into the group
- changing it repaints the group already open in the tab strip, in every window, rather than
  waiting for the group to be created again
- the subgroup's heading on the page carries a bar in the same colour, so the page and the tab
  strip agree about which group is which
- synchronised like any other property of a subgroup; null on the account means "never given
  one", and the device that next sees it assigns one

### [middle] add validations and constraints to all modal dialogs
- InputDialog fields now take constraints - { type, required, maxLength } - beside the bare
  type; a required field is marked with * and the dialog will not submit while anything is
  wrong: OK is disabled and Enter refuses too
- the message appears under the field it is about, not in the console. It stays hidden until
  the field has been touched or somebody tried to confirm, so a dialog does not open shouting
- limits are the backend's own @Size values, kept in SyncContracts: name 120, description 500,
  link title 200, url 2048. Enforcing them here is what stops one over-long name failing the
  whole push with a 400 and blocking every other change from syncing
- workspace, group, subgroup, link, profile name, log in and sync code dialogs all carry
  required constraints on at least one field
- URL fields refuse javascript:, data:, vbscript: and blob: - a link is an anchor on an
  extension page - and assume https for an address typed without a scheme
- view model validations are now logged backstops for callers that are not a dialog

### [medium] Add "settings" to application menu
- "Settings" is the last item of the application menu, behind a separator, in both the
  signed-in and the signed-out menu
- modal dialog, built the same way "Manage profiles" is - same frame, opened from the menu,
  its own view model over the profile registry
- settings belong to the PROFILE and ride on the profile record, so they synchronise with no
  new entity kind, no snapshot collection and no merge rules: a change is a difference in the
  profile upsert the change set already sends. The dialog says which profile it is about,
  because that is the cost of it
- settings are drawn in collapsible categories; the first is "UI and behavior", and it is
  where "enable drag & drop" lives. Adding a setting is a line in the CATEGORIES list in
  settingsViewModel.ts and nothing else; a category with nothing in it yet is not drawn
- which categories are folded is not stored and not synchronised - it is how the screen is
  being looked at, and a dialog opened again starts with the first category expanded
- first setting is "enable drag & drop", off by default; nothing reads it yet, the dragging
  itself is still to be built
- NOT done: "open links in separate tabs" and greying out a subgroup's "catch links into tab
  group" against it - that setting does not exist yet either

### [medium] Bookmarking currently opened webpage
- the form is the extension's action popup (toolbar bubble), opened three ways: the toolbar
  icon, the keyboard shortcut (Alt+Shift+D, through `_execute_action`), and two right-click
  entries - "Bookmark this page with ..." and, over a link, "Bookmark this link with ..."
- Ctrl+Shift+D was asked for and cannot be had: Chrome and Brave both keep it for "bookmark all
  tabs", and a suggested key the browser refuses leaves the command silently unbound. The key
  is rebindable at chrome://extensions/shortcuts
- it was a window of its own first, and that is what the popup replaced: a browser window comes
  furnished with a title bar and, since Chrome 138, the new tab page footer naming the
  extension, and it had to measure and resize itself. A popup has neither problem - it sizes
  itself to the form. In exchange it closes when it loses focus
- the layout is the one described here: favicon left, labels right-aligned in the middle,
  fields right; name and URL pre-filled, the open workspace stated, a group dropdown, and a
  subgroup dropdown that appears only for a group that has subgroups
- a profile with no group says so instead of inventing a workspace
- the only permission added is "contextMenus", which has no install-time warning
- NOT done: the popup does not synchronise by itself. It stores the link and the next new tab
  page pushes it, the way anything made offline is pushed
- NOT done: no toolbar icon artwork - the manifest has no icons at all, so the browser draws
  its generic one
- needed on the way: AppStateRepository now adopts a write made in another page, or a new tab
  page left open would overwrite the bookmark with its own older copy

### [small] assign link which is in some subgroup into tab group automatically
- "Catch links into tab group" in the subgroup menu, drawn as a checkbox, off for a new subgroup
- caught in the background service worker on the navigation itself, so a link opened from a
  bookmark, another page or the address bar is grouped just as one clicked in the new tab page is
- the tab group is found by the subgroup's title in that window and created only when absent;
  opening the whole subgroup now joins that same group instead of making a second one
- NOT done: greying it out against "open links in separate tabs" - that setting does not exist
  yet, see the settings task above

### changing the order of links on group if subgroup is between them
- case: at the group from the top:
  - link1
  - subgroup with links
  - link2
- i want to achieve:
  - link1
  - link2
  - subgroup
- links 1 and 2 are repatedly swapped like subGroup is not counted

### [small] for group menu, add "migrate to workspace"
- new menu item "Migrarte to other workspace" should appear
- when clicked, modal dialog with dropdown with available workspace selction should occur

### [small] group description when creating group
- add description field to group creation dialog too

### [small] workspace description when creating workspace
- add description field to workspace creation dialog too

