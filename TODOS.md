# TODOs

Note for agents: 
- each task into its feature branch
- if makes logical sense, each root level bullet should be 1 commit
- after doing the task, move to done


## Features that must be done before release

### [small] Add "upgrade to premium" to app menu (three dots upper right corner)
- displayed when user is logged in after "synchronised"
- TODO - where it should point - functionality not yet implemented in the backend

### [big] Drag & drop support
- change links order by dragging
- drag link from group to subgroup and vice versa
- drag link between groups and subgroups
- drag group to change its order

### [BIG] i18n
- find all hardcoded strings or text strings in variables and put them in one place in json
- add support for multiple languages
- add second language - slovak - and translate into it

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

### [critical] Sync event even on idle
- while 2nd browser is connected, then 
  ```
  [SyncCoordinator.push] Sending 12 operations
  SyncContracts-B8PKd6Qb.js:1 [SyncCoordinator.onRefresh] The account changed elsewhere
  ```
  is happening at least every second - i think there is some kind of circular dependency


## TO BE approved / analyzed

### [big] History panel
Note: chrome.history permission can be problematic when submitting to chrome store
- containing 2 tabs:
  - last closed tabs
  - most visited links (not bookmarked yet)


# DONE

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

