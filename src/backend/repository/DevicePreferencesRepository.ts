import { ChromeStorageWrapper } from "../datasource/chromeStorage/chromeStorageWrapper";
import { DEVICE_PREFERENCES_KEY } from "../datasource/chromeStorage/storageKeys";
import { Logger } from "../../utils/logger";
import { ObservableValue } from "../../utils/observableValue";

/**
 *  Preferences that belong to this browser rather than to the profile.
 *
 *  **Deliberately not synchronised, and not on the profile record.** Everything in
 *  `ProfileSettings` follows the user to every device, which is right for a choice about how
 *  their links behave and wrong for a choice about how big things are: a 27-inch desktop and a
 *  13-inch laptop want different answers, and one dictating the other is worse than neither
 *  knowing. This is the same reasoning that keeps which workspace is open per-device.
 *
 *  It also means no backend column, no migration and no merge rule for something the account
 *  has no opinion about.
 */

/** How big the interface is, as a multiple of the browser's own font size. */
export interface DevicePreferences {
    scale: number;
}

/** The size an interface nobody has resized is drawn at: the browser's own. */
export const DEFAULT_SCALE = 1;

/** Smallest and largest the interface may be drawn, and the step between them. */
export const MIN_SCALE = 0.625;
export const MAX_SCALE = 1.5;
export const SCALE_STEP = 0.0625;

/**
 *  The nearest size this actually offers.
 *
 *  Clamped and snapped to the step, because the value can arrive from places the slider does
 *  not control: storage written by an older version, a value edited by hand, a number that a
 *  future version's wider range produced. A root font size of zero is a page nobody can read
 *  and nothing on it to click to fix that, so this refuses to be the thing that causes it.
 *
 *  @param value the size asked for
 *  @return the size that will be used
 */
export function normalizeScale(value: number): number {
    if (!Number.isFinite(value)) {
        return DEFAULT_SCALE;
    }
    // The step is a sixteenth, and a sixteenth is exact in binary - so snapping to it cannot
    // leave the floating point dust that a step of, say, a tenth would. A step chosen later
    // that is not a power of two will need rounding here, and the test for that is already
    // written: it asserts every value is an exact multiple of the step.
    const snapped = Math.round(value / SCALE_STEP) * SCALE_STEP;
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, snapped));
}

export class DevicePreferencesRepository {

    private LOG: Logger = new Logger("DevicePreferencesRepository");
    private datasource = new ChromeStorageWrapper();

    private preferences: DevicePreferences = { scale: DEFAULT_SCALE };

    /** Fires when something here changes, so an open page can redraw itself. */
    public readonly preferences$ = new ObservableValue<DevicePreferences>(
        { scale: DEFAULT_SCALE });

    /**
     *  Loads what this browser prefers.
     *
     *  Awaited before the page draws anything, so that a resized interface is the size it
     *  should be from the first frame rather than jumping once storage answers.
     */
    public async init(): Promise<void> {
        const stored = await this.datasource.get<DevicePreferences>(DEVICE_PREFERENCES_KEY);
        this.preferences = { scale: normalizeScale(stored?.scale ?? DEFAULT_SCALE) };
        this.preferences$.set(this.preferences);
    }

    /** How big the interface is. */
    public getScale(): number {
        return this.preferences.scale;
    }

    /**
     *  Resizes the interface and remembers it.
     *
     *  @param scale the size asked for; clamped and snapped to what is on offer
     */
    public async setScale(scale: number): Promise<void> {
        const wanted = normalizeScale(scale);
        if (wanted === this.preferences.scale) {
            return;
        }
        this.preferences = { ...this.preferences, scale: wanted };
        this.LOG.debug("setScale", `${wanted}em`);
        await this.datasource.save(DEVICE_PREFERENCES_KEY, this.preferences);
        this.preferences$.set(this.preferences);
    }

    /**
     *  Draws the page at the stored size.
     *
     *  On the root element, because everything in this extension is sized in em: one number
     *  there moves the whole interface, its spacing along with its text, which is what
     *  resizing an interface should do and what setting a body font size does not.
     */
    public applyScale(): void {
        applyScaleTo(document.documentElement, this.preferences.scale);
    }
}

/**
 *  Sets a root element's font size, which is what every other size here is relative to.
 *
 *  Separate from the repository so that a page can be resized without one - and so the rule
 *  for turning a number into a length lives in exactly one place.
 */
export function applyScaleTo(root: HTMLElement, scale: number): void {
    root.style.fontSize = `${normalizeScale(scale)}em`;
}

export const devicePreferencesRepository = new DevicePreferencesRepository();
