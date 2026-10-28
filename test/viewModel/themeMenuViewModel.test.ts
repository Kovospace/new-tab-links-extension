import { describe, expect, it } from "vitest";
import { ThemeMenuViewModel } from "../../src/viewModel/themeMenuViewModel";
import {
    DevicePreferences, ThemeId
} from "../../src/backend/repository/DevicePreferencesRepository";
import { ObservableValue } from "../../src/utils/observableValue";

/** The two members the view model uses, kept the way the repository keeps them. */
function fakePreferences(theme: ThemeId) {
    const preferences$ = new ObservableValue<DevicePreferences>(
        { theme } as unknown as DevicePreferences);
    return {
        preferences$,
        setTheme: async (wanted: string): Promise<void> => {
            preferences$.set({ ...preferences$.get(), theme: wanted as ThemeId });
        }
    };
}

const ticked = (viewModel: ThemeMenuViewModel): ThemeId[] =>
    viewModel.menu$.get().options.filter(option => option.chosen).map(option => option.theme);

describe("ThemeMenuViewModel", () => {

    it("offers the three themes and ticks the one this browser is set to", () => {
        const viewModel = new ThemeMenuViewModel(fakePreferences("dark"));

        expect(viewModel.menu$.get().options.map(option => option.theme))
            .toEqual(["auto", "light", "dark"]);
        expect(viewModel.menu$.get().chosen).toBe("dark");
        expect(ticked(viewModel)).toEqual(["dark"]);
    });

    it("names the theme in force on the button", () => {
        expect(new ThemeMenuViewModel(fakePreferences("auto")).menu$.get().buttonLabel)
            .toBe("Mode: System");
        expect(new ThemeMenuViewModel(fakePreferences("light")).menu$.get().buttonLabel)
            .toBe("Mode: Light");
    });

    it("puts a chosen theme in force and ticks it instead", async () => {
        const preferences = fakePreferences("auto");
        const viewModel = new ThemeMenuViewModel(preferences);

        await viewModel.choose("light");

        expect(preferences.preferences$.get().theme).toBe("light");
        expect(ticked(viewModel)).toEqual(["light"]);
    });

    it("follows a theme chosen elsewhere - Settings, or another page", () => {
        const preferences = fakePreferences("light");
        const viewModel = new ThemeMenuViewModel(preferences);

        preferences.preferences$.set({ ...preferences.preferences$.get(), theme: "dark" });

        expect(viewModel.menu$.get().chosen).toBe("dark");
        expect(ticked(viewModel)).toEqual(["dark"]);
    });
});
