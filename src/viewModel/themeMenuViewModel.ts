import {
    devicePreferencesRepository, DevicePreferencesRepository, ThemeId, THEMES
} from "../backend/repository/DevicePreferencesRepository";
import { ObservableValue } from "../utils/observableValue";
import { t } from "../i18n/i18n";

/** One theme on offer in the header's theme menu. */
export type ThemeOptionDTO = {
    theme: ThemeId;
    label: string;
    chosen: boolean;
};

/** What the header's theme menu draws: the themes, and the one this browser is set to. */
export type ThemeMenuDTO = {
    chosen: ThemeId;
    options: ThemeOptionDTO[];
};

/**
 *  The header's quick theme switcher (#155) - the same device preference as Settings → Theme,
 *  one click away instead of three.
 *
 *  Follows `preferences$` rather than keeping a copy, so a theme chosen in Settings or in
 *  another page of this browser is the one ticked here too.
 */
export class ThemeMenuViewModel {

    public readonly menu$: ObservableValue<ThemeMenuDTO>;

    private devicePreferences: Pick<DevicePreferencesRepository, "preferences$" | "setTheme">;

    constructor(
        devicePreferences: Pick<DevicePreferencesRepository, "preferences$" | "setTheme">
            = devicePreferencesRepository
    ) {
        this.devicePreferences = devicePreferences;
        this.menu$ = new ObservableValue<ThemeMenuDTO>(
            menuFor(devicePreferences.preferences$.get().theme));
        devicePreferences.preferences$.subscribe(preferences =>
            this.menu$.set(menuFor(preferences.theme)));
    }

    /** Puts the theme in force on this browser; the menu follows through `preferences$`. */
    public async choose(theme: ThemeId): Promise<void> {
        await this.devicePreferences.setTheme(theme);
    }
}

/** The menu for a browser set to this theme. Labels are the Settings dialog's own. */
function menuFor(chosen: ThemeId): ThemeMenuDTO {
    return {
        chosen,
        options: THEMES.map(theme => ({
            theme,
            label: t(`settings.theme.options.${theme}`),
            chosen: theme === chosen
        }))
    };
}
