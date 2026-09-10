/**
 *  What a profile is set to do, as opposed to what it holds.
 *
 *  **Settings belong to a profile, not to the device and not to the account.** A profile is
 *  already the unit everything else is synchronised in - it is what the backend keys its rows
 *  by - so a setting kept here rides along with the profile record and needs no store, no
 *  entity kind and no merge rules of its own. The price, paid knowingly: two profiles are two
 *  sets of preferences, and turning something on for work does not turn it on for home.
 *
 *  Every setting is a plain boolean with a default of "off", and is read through
 *  `settingsOf()` rather than straight off the profile. A profile stored before a setting
 *  existed says nothing about it, and so does an account whose backend does not know it yet;
 *  both have to read as the default rather than as undefined.
 */
export interface ProfileSettings {

    /**
     *  Whether links, groups and subgroups can be rearranged by dragging them.
     *
     *  Off for now because the dragging itself does not exist yet - see TODOS.md. The setting
     *  lands first deliberately: it is what the feature will be built behind, so that it can
     *  be turned off by anyone it gets in the way of.
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
}

/** What a profile that has never been configured is set to. */
export const DEFAULT_PROFILE_SETTINGS: ProfileSettings = {
    enableDragAndDrop: false,
    hideTips: false
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
