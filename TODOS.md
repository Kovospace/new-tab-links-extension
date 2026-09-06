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
- in application menu (three dots upper right corner) it should be the last item and add separator before it

### [medium] Bookmarking currently opened webpage
According to research this is possible even without any nasty permissions, thinkg needed:
- extension should declare extension command to for example "CTRL + SHIFT + D"
- worker will open some UI modal dialog with form with:
    - Name: pre-filled
    - URL: pre-filled
    - favicon image (left to columns with inputs)
    - name of current workspace just for information
    - group select dropdown
        - another subgroup dropdown if is detected that given group contains at least one subgroup
    - "save" button
      Layout of modal dialog:
    - left column: favicon
    - center column: labels, text aligned to the right
    - right column: form fields

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

### [small] assign link which is in some subgroup into tab group automatically
- add one more setting (checkbox) into subgroup settings like "catch all links into tab group"
  - when active, the link opened from elsewhere or single link opened from subgroup will always be grouped
  - if no links are opened yet and tab group does not exists, it will be created
  - this setting is in conflict with "open links in separate tabs" - make it grayed out and inactive if this is active

### [middle] add validations and constraints to all modal dialogs
- when creating workspace, groups, link, or subGroup there should always be at least "required" constraints 
  for at least 1 field
- validations follows the contraints
- now validations in viewModel goes to the console, this info should go to the user at first - ideally modal should
  not be allowed to be submitted


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

