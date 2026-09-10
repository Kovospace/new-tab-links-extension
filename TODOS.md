# TODOs

Note for agents: 
- each task into its feature branch
- if makes logical sense, each root level bullet should be 1 commit
- after doing the task, move to done


## Features that must be done before release

### [small] Add "upgrade to premium" to app menu (three dots upper right corner)
- displayed when user is logged in after "synchronised"
- TODO - where it should point - functionality not yet implemented in the backend

### [medium] Add "settings" to application menu
- implement settings page as the modal dialog, the same way how functionality "Manage profiles" is implemented
- data structure for settings off course, synchronized too
- first setting will be: "enable drag & drop"
- when "open links in separate tabs" lands here, it has to grey out a subgroup's "catch links
  into tab group" while it is on - the two contradict each other
- in application menu (three dots upper right corner) it should be the last item and add separator before it

### [big] Drag & drop support
- change links order by dragging
- drag link from group to subgroup and vice versa
- drag link between groups and subgroups
- drag group to change its order

### [medium] Custom color for tab group
- predefine 16 default colors and:
    - choose one randomly for new subgroup from ones that are not in use yet (from default 16)
        - if all have been used, then again choose randomly and then from the colors that have been used least times and so on
- when opening all links from subgroup
- add menu item to subGroup menu "* | Grouped tabs color"
    - where "*" is circle showing actual group color followed by menu item description
    - on click open some color picker with:
        - picking color from color wheel
        - picking color by entering hex code
        - with list of 16 default pre-defined colors

### [big] Add panel with last opened tabs (closed tabs history)
- synchronized, BUT by active profile
- ordered by time, include device name if tab was closed on another device than in current
- after implementing drag and drop, the drag and drop should work there too when adding as new link somewhere
- signalize by icon of green folder that some of this closed tabs may already be bookmarked

### [middle] add validations and constraints to all modal dialogs
- when creating workspace, groups, link, or subGroup there should always be at least "required" constraints 
  for at least 1 field
- validations follows the contraints
- now validations in viewModel goes to the console, this info should go to the user at first - ideally modal should
  not be allowed to be submitted

### [small] add tips to the columns screen background
- the tips will be stored in json with translations - as array, there may be more and more of them towards the future
- displayed 
- add close button that will appear after the tip whem mouse hovering it
  - when clicked, show modal dialog asking user if he wants to hide them
  - add buttons for "next tip" and "previous tip" - all of them together with remove visible on mouseover
- show random tip on every new tab open
- add possibility to have "tell me more" button if tip si some feature tht needs further expalanation
  - the url will resolve to the page where "tutorials" will be - 
    - just add url field into json with translations and if it is there, the button is displayed


## BUGFIXING

## DO NOT DO, Must be decided, too complex and few fallpoints - but still vital if done on fisrt release

### [big] History panel
Note: chrome.history permission can be problematic when submitting to chrome store
- containing 2 tabs:
    - last closed tabs
    - most visited links (not bookmarked yet)

### [big] Add panel with currently opened tabs
Note: needs permission "chrome.session"
- should be located on the right
- distinguish somehow which links are already added in current profile
- simple adding by drag and drop
    - on drop, open link add dialog with pre-filled values
- check if it is possible to somehow change behaviour of CTRL+D shortcut and set it as replacement for browser bookmarks
  manager - NO it is not


# DONE

### [medium] Bookmarking currently opened webpage
- two ways in: a right-click menu entry ("Bookmark this page with ...", and "Bookmark this
  link with ..." over a link), and the command "bookmark-current-page" suggested at Alt+Shift+D
- Ctrl+Shift+D was asked for and cannot be had: Chrome and Brave both keep it for "bookmark all
  tabs", and a suggested key the browser refuses leaves the command silently unbound. The menu
  is what carries the feature; the key is rebindable at chrome://extensions/shortcuts
- the worker reads the tab it can already see and opens the extension's own small window on it,
  rather than injecting a form into the visited page; the only permission added is
  "contextMenus", which has no install-time warning
- the form is the modal dialog described here - favicon on the left, labels right-aligned in the
  middle, fields on the right - with name and URL pre-filled, the open workspace stated, a group
  dropdown, and a subgroup dropdown that appears only for a group that has subgroups
- pressing the shortcut again re-uses the window it already opened, on the new page
- a profile with no group says so instead of inventing a workspace
- NOT done: the window does not synchronise by itself. It stores the link and the next new tab
  page pushes it, the way anything made offline is pushed
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

