import { ChromeStorageWrapper } from "../datasource/chromeStorage/chromeStorageWrapper";
import { DEVICE_PREFERENCES_KEY } from "../datasource/chromeStorage/storageKeys";
import {
    DateFormatId, DEFAULT_DATE_FORMAT, normalizeDateFormat, setDateFormat
} from "../../i18n/dates";
import { applyLanguageToDocument, setLanguage } from "../../i18n/i18n";
import { AUTOMATIC_LANGUAGE, isSupportedLanguage } from "../../i18n/languages";
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
 *
 *  **The language is here for that same reason, and it is worth saying why**, because a
 *  language looks at first like something that follows the person rather than the machine. It
 *  does not: the browser it is read from is the machine's, one person's two browsers are
 *  routinely set to two different languages, and a household or an office sharing an account
 *  across machines set up in different countries is the ordinary case rather than the odd one.
 *  The practical half of the argument agrees with the principled half - `ProfileSettings` is
 *  booleans that ride on the profile record, and a language is a string, which would be a
 *  backend column, a snapshot field and a merge rule for a choice the account has no opinion
 *  about.
 */

/** What this browser prefers, none of which the account is told. */
export interface DevicePreferences {

    /** How big the interface is, as a multiple of the browser's own font size. */
    scale: number;

    /** Which language to speak, or "auto" to follow the browser. */
    language: string;

    /** How dates are written, or "auto" to follow the browser's region. */
    dateFormat: DateFormatId;
}

/** The size an interface nobody has resized is drawn at: the browser's own. */
export const DEFAULT_SCALE = 1;

/** What a device nobody has answered these for prefers: whatever the browser is set to. */
const DEFAULTS: DevicePreferences = {
    scale: DEFAULT_SCALE,
    language: AUTOMATIC_LANGUAGE,
    dateFormat: DEFAULT_DATE_FORMAT
};

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

    private preferences: DevicePreferences = { ...DEFAULTS };

    /** Fires when something here changes, so an open page can redraw itself. */
    public readonly preferences$ = new ObservableValue<DevicePreferences>({ ...DEFAULTS });

    /**
     *  Loads what this browser prefers.
     *
     *  Awaited before the page draws anything, so that a resized interface is the size it
     *  should be from the first frame rather than jumping once storage answers.
     */
    public async init(): Promise<void> {
        const stored = await this.datasource.get<Partial<DevicePreferences>>(
            DEVICE_PREFERENCES_KEY);
        this.preferences = {
            scale: normalizeScale(stored?.scale ?? DEFAULT_SCALE),
            language: normalizeLanguagePreference(stored?.language),
            dateFormat: normalizeDateFormat(stored?.dateFormat)
        };
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

    /** Which language this browser is set to, which may be "auto". */
    public getLanguage(): string {
        return this.preferences.language;
    }

    /**
     *  Chooses the language this browser is spoken to in.
     *
     *  Stored, not applied: every string in the interface is read once, while it is being
     *  drawn, so a language changed under a page that is already on screen changes nothing
     *  the user can see. Whoever changes it is responsible for redrawing - which on this
     *  page means reloading it, and is why the settings dialog does exactly that.
     *
     *  @param language a base code, or "auto" to follow the browser
     */
    public async setLanguage(language: string): Promise<void> {
        const wanted = normalizeLanguagePreference(language);
        if (wanted === this.preferences.language) {
            return;
        }
        this.preferences = { ...this.preferences, language: wanted };
        this.LOG.debug("setLanguage", wanted);
        await this.datasource.save(DEVICE_PREFERENCES_KEY, this.preferences);
        this.preferences$.set(this.preferences);
    }

    /** How this browser is set to write dates, which may be "auto". */
    public getDateFormat(): DateFormatId {
        return this.preferences.dateFormat;
    }

    /**
     *  Chooses how dates are written on this browser.
     *
     *  @param dateFormat one of the formats on offer; anything else means local custom
     */
    public async setDateFormat(dateFormat: string): Promise<void> {
        const wanted = normalizeDateFormat(dateFormat);
        if (wanted === this.preferences.dateFormat) {
            return;
        }
        this.preferences = { ...this.preferences, dateFormat: wanted };
        this.LOG.debug("setDateFormat", wanted);
        await this.datasource.save(DEVICE_PREFERENCES_KEY, this.preferences);
        this.preferences$.set(this.preferences);
    }

    /**
     *  Puts the stored language and date format in force.
     *
     *  Called beside `applyScale()` and for the same reason: before anything is drawn. Every
     *  string in this interface is read once, as its element is built, so a language applied
     *  after the first render is a page that has to be built twice - and the reader sees the
     *  wrong one of the two.
     */
    public applyLocale(): void {
        setLanguage(this.preferences.language);
        setDateFormat(this.preferences.dateFormat);
        applyLanguageToDocument();
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
 *  The nearest language preference this actually understands.
 *
 *  A language we no longer ship - a locale removed, storage written by a newer version - reads
 *  as "follow the browser" rather than as itself, so the reader gets their own language back
 *  instead of a page of keys.
 */
export function normalizeLanguagePreference(value?: string | null): string {
    if (!value || value === AUTOMATIC_LANGUAGE) {
        return AUTOMATIC_LANGUAGE;
    }
    return isSupportedLanguage(value) ? value : AUTOMATIC_LANGUAGE;
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
