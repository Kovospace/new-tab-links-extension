/**
 *  What a profile is set to do, as opposed to what it holds.
 *
 *  **Settings belong to a profile, not to the device and not to the account.** A profile is
 *  already the unit everything else is synchronised in - it is what the backend keys its rows
 *  by - so a setting kept here rides along with the profile record and needs no store, no
 *  entity kind and no merge rules of its own. The price, paid knowingly: two profiles are two
 *  sets of preferences, and turning something on for work does not turn it on for home.
 *
 *  Every setting is a plain boolean, defaulting to "off" with one exception named below -
 *  except `dismissedTips`, a list that defaults to empty - and every one is read through
 *  `settingsOf()` rather than straight off the profile. A profile stored before a setting
 *  existed says nothing about it, and so does an account whose backend does not know it yet;
 *  both have to read as the default rather than as undefined.
 */
export interface ProfileSettings {

    /**
     *  Whether links, groups and subgroups can be rearranged by dragging them.
     *
     *  **On by default - the one setting that breaks the "off" rule.** It was added off while
     *  the dragging did not exist yet, so off was the old behaviour. Now dragging is how the
     *  page is meant to be used and off is the opt-out. Renaming it to a "disable" setting
     *  would have kept the rule but renamed a backend column; flipping the default costs only
     *  this: a profile that never said anything reads as on. One that was ever pulled from an
     *  account has the account's value written out, and keeps it.
     */
    enableDragAndDrop: boolean;

    /**
     *  Whether the tips along the bottom of the workspace are dismissed.
     *
     *  Named for hiding rather than for showing, which is not a style choice: every setting
     *  here defaults to off, and off has to mean the behaviour a profile had before the
     *  setting existed. Tips were visible, so "visible" is what false must mean.
     */
    hideTips: boolean;

    /**
     *  The tips dismissed one at a time ("I know"), by their `id` in `ui/tips/tips.json`.
     *
     *  Beside `hideTips` rather than instead of it: that one silences every tip, this one only
     *  the tips somebody has already understood. A list and not a boolean, so it is the one
     *  setting `ToggleableSetting` leaves out. Kept in the order the tips were dismissed and
     *  sent to the account exactly as stored: anything a pull reorders or filters would be a
     *  difference the next change set reports again. Bounded where it is written
     *  (`TipsViewModel.dismissCurrent`), never where it is read.
     */
    dismissedTips: string[];
}

/** The settings that are on or off, which is every one but the list of dismissed tips. */
export type ToggleableSetting = {
    [KEY in keyof ProfileSettings]: ProfileSettings[KEY] extends boolean ? KEY : never
}[keyof ProfileSettings];

/** What a profile that has never been configured is set to. */
export const DEFAULT_PROFILE_SETTINGS: ProfileSettings = {
    enableDragAndDrop: true,
    hideTips: false,
    dismissedTips: []
};

/**
 *  One profile's settings, with anything unsaid filled in.
 *
 *  @param carrier the profile, or anything else carrying settings; absent is not an error
 *  @return the settings as they stand, every field present
 */
export function settingsOf(carrier: { settings?: ProfileSettings } | null | undefined): ProfileSettings {
    return { ...DEFAULT_PROFILE_SETTINGS, ...(carrier?.settings ?? {}) };
}
