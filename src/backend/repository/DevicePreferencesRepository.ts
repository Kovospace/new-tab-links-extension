import deepEqual from "fast-deep-equal";

import { ChromeStorageWrapper } from "../datasource/chromeStorage/chromeStorageWrapper";
import { DEVICE_PREFERENCES_KEY } from "../datasource/chromeStorage/storageKeys";
import {
    DateFormatId, DEFAULT_DATE_FORMAT, normalizeDateFormat, setDateFormat
} from "../../i18n/dates";
import { applyLanguageToDocument, setLanguage } from "../../i18n/i18n";
import { AUTOMATIC_LANGUAGE, isSupportedLanguage } from "../../i18n/languages";
import {
    DEFAULT_SEARCH_ENGINE, normalizeSearchEngine, SearchEngineId
} from "../entity/SearchEngines";
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

    /**
     *  Which engine the search bar sends a query to. Per device for the reason the language
     *  is: one person's work and home browsers routinely want different answers, and a string
     *  on the profile record would be a backend column for a choice the account has no
     *  opinion about.
     */
    searchEngine: SearchEngineId;

    /**
     *  How long, in milliseconds, the pointer has to rest on the closed-tabs rail before it
     *  widens. Per device for the reason the size is: it is a matter of the hand and the
     *  pointing device, and a trackpad and a mouse want different answers.
     */
    closedTabsOpenDelay: number;

    /**
     *  Which card the side panel shows - the tabs open in this browser, the recently closed
     *  ones, or the browsing history. Per device because the open tabs are this browser's alone, and a question of how
     *  this screen is being used rather than of what the profile holds.
     */
    sidePanelCard: SidePanelCard;

    /**
     *  Whether the side panel stays open at full width whatever the pointer does. Off by
     *  default, which is the rail that widens under the pointer. Per device because it is a
     *  question of screen width: a wide desktop has room for the panel beside the columns,
     *  and a laptop does not.
     */
    keepSidePanelOpen: boolean;

    /**
     *  Whether this browser synchronises with the account it is signed in to. On by default;
     *  off, the browser stays signed in - premium still lifts its limits - but nothing is
     *  pushed or pulled. Per device because the reason to turn it off is this machine: a work
     *  laptop whose links should not leave it, while the same account synchronises at home.
     */
    syncEnabled: boolean;

    /**
     *  Whether the page is drawn light or dark, or "auto" to follow the operating system.
     *  Per device for the reason the size is: the same person runs a light desktop at work
     *  and a dark laptop at night, and the system setting each one follows is that machine's.
     */
    theme: ThemeId;
}

/** The themes on offer: following the system, or one of the two regardless of it. */
export type ThemeId = "auto" | "light" | "dark";
export const THEMES: ThemeId[] = ["auto", "light", "dark"];

/** Following the system, which is what a page with no opinion of its own should do. */
export const DEFAULT_THEME: ThemeId = "auto";

/** The theme a stored value names, or the default for anything this version does not know. */
export function normalizeTheme(value?: string | null): ThemeId {
    return THEMES.includes(value as ThemeId) ? value as ThemeId : DEFAULT_THEME;
}

/** The cards the side panel can show, one at a time. */
export type SidePanelCard = "open" | "closed" | "history";

/** Closed tabs, which is what the panel showed before it had a second card. */
export const DEFAULT_SIDE_PANEL_CARD: SidePanelCard = "closed";

/** The card a stored value names, or the default for anything this version does not know. */
export function normalizeSidePanelCard(value?: string | null): SidePanelCard {
    return value === "open" || value === "closed" || value === "history"
        ? value
        : DEFAULT_SIDE_PANEL_CARD;
}

/** The size an interface nobody has resized is drawn at: the browser's own. */
export const DEFAULT_SCALE = 1;

/** How long the pointer rests on the closed-tabs rail before it opens, in milliseconds. */
export const DEFAULT_CLOSED_TABS_OPEN_DELAY = 300;
export const MIN_CLOSED_TABS_OPEN_DELAY = 0;
export const MAX_CLOSED_TABS_OPEN_DELAY = 1500;
export const CLOSED_TABS_OPEN_DELAY_STEP = 100;

/**
 *  The nearest delay this actually offers, clamped and snapped like the size and for the
 *  same reason: the value can come from storage the slider never wrote.
 *
 *  @param value the delay asked for, in milliseconds
 *  @return the delay that will be used
 */
export function normalizeClosedTabsOpenDelay(value: number): number {
    if (!Number.isFinite(value)) {
        return DEFAULT_CLOSED_TABS_OPEN_DELAY;
    }
    const snapped = Math.round(value / CLOSED_TABS_OPEN_DELAY_STEP) * CLOSED_TABS_OPEN_DELAY_STEP;
    return Math.min(MAX_CLOSED_TABS_OPEN_DELAY, Math.max(MIN_CLOSED_TABS_OPEN_DELAY, snapped));
}

/** What a device nobody has answered these for prefers: whatever the browser is set to. */
const DEFAULTS: DevicePreferences = {
    scale: DEFAULT_SCALE,
    language: AUTOMATIC_LANGUAGE,
    dateFormat: DEFAULT_DATE_FORMAT,
    searchEngine: DEFAULT_SEARCH_ENGINE,
    closedTabsOpenDelay: DEFAULT_CLOSED_TABS_OPEN_DELAY,
    sidePanelCard: DEFAULT_SIDE_PANEL_CARD,
    keepSidePanelOpen: false,
    syncEnabled: true,
    theme: DEFAULT_THEME
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

    /** Whether this browser synchronises, on its own so synchronisation follows nothing else. */
    public readonly syncEnabled$ = new ObservableValue<boolean>(DEFAULTS.syncEnabled);

    /** Whether the storage listener is on; `init` runs once per page, but nothing forbids twice. */
    private watching: boolean = false;

    /**
     *  Loads what this browser prefers.
     *
     *  Awaited before the page draws anything, so that a resized interface is the size it
     *  should be from the first frame rather than jumping once storage answers.
     */
    public async init(): Promise<void> {
        const stored = await this.datasource.get<Partial<DevicePreferences>>(
            DEVICE_PREFERENCES_KEY);
        this.preferences = normalizePreferences(stored);
        this.publish();
        this.watchForWrites();
    }

    private publish(): void {
        this.preferences$.set(this.preferences);
        this.syncEnabled$.set(this.preferences.syncEnabled);
    }

    /**
     *  Adopts what another page of this browser stored.
     *
     *  Turning synchronisation off in one new tab has to stop it in every other one already
     *  open: a page still synchronising on the preference it loaded would push the very links
     *  the user just decided to keep here. The rest of the preferences come along because
     *  there is no reason for an open page to hold a stale copy of any of them.
     */
    private watchForWrites(): void {
        if (this.watching || !chrome.storage?.onChanged?.addListener) {
            return;
        }
        this.watching = true;
        chrome.storage.onChanged.addListener((changes, areaName) => {
            const change = changes[DEVICE_PREFERENCES_KEY];
            if (areaName !== "local" || !change) {
                return;
            }
            const next = normalizePreferences(change.newValue as Partial<DevicePreferences> | undefined);
            if (!deepEqual(next, this.preferences)) {
                this.preferences = next;
                this.publish();
            }
        });
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
        this.publish();
    }

    /** How long the pointer rests on the closed-tabs rail before it opens, in milliseconds. */
    public getClosedTabsOpenDelay(): number {
        return this.preferences.closedTabsOpenDelay;
    }

    /**
     *  Changes how long the closed-tabs rail waits before it opens, and remembers it.
     *
     *  Nothing to apply: the panel reads the delay each time the pointer arrives.
     *
     *  @param delay milliseconds; clamped and snapped to what is on offer
     */
    public async setClosedTabsOpenDelay(delay: number): Promise<void> {
        const wanted = normalizeClosedTabsOpenDelay(delay);
        if (wanted === this.preferences.closedTabsOpenDelay) {
            return;
        }
        this.preferences = { ...this.preferences, closedTabsOpenDelay: wanted };
        this.LOG.debug("setClosedTabsOpenDelay", `${wanted}ms`);
        await this.datasource.save(DEVICE_PREFERENCES_KEY, this.preferences);
        this.publish();
    }

    /** Which card the side panel shows. */
    /** Whether this browser synchronises with its account; see `DevicePreferences.syncEnabled`. */
    public isSyncEnabled(): boolean {
        return this.preferences.syncEnabled;
    }

    public async setSyncEnabled(enabled: boolean): Promise<void> {
        if (enabled === this.preferences.syncEnabled) {
            return;
        }
        this.preferences = { ...this.preferences, syncEnabled: enabled };
        this.LOG.debug("setSyncEnabled", enabled);
        await this.datasource.save(DEVICE_PREFERENCES_KEY, this.preferences);
        this.publish();
    }

    public getSidePanelCard(): SidePanelCard {
        return this.preferences.sidePanelCard;
    }

    /**
     *  Remembers which card the side panel shows, so the next new tab opens on it.
     *
     *  @param card the card chosen
     */
    public async setSidePanelCard(card: SidePanelCard): Promise<void> {
        const wanted = normalizeSidePanelCard(card);
        if (wanted === this.preferences.sidePanelCard) {
            return;
        }
        this.preferences = { ...this.preferences, sidePanelCard: wanted };
        this.LOG.debug("setSidePanelCard", wanted);
        await this.datasource.save(DEVICE_PREFERENCES_KEY, this.preferences);
        this.publish();
    }

    public getKeepSidePanelOpen(): boolean {
        return this.preferences.keepSidePanelOpen;
    }

    /**
     *  Keeps the side panel open on this device, or hands it back to the pointer. Every open
     *  page follows, through `preferences$`.
     *
     *  @param keep whether the panel stays open
     */
    public async setKeepSidePanelOpen(keep: boolean): Promise<void> {
        if (keep === this.preferences.keepSidePanelOpen) {
            return;
        }
        this.preferences = { ...this.preferences, keepSidePanelOpen: keep };
        this.LOG.debug("setKeepSidePanelOpen", keep);
        await this.datasource.save(DEVICE_PREFERENCES_KEY, this.preferences);
        this.publish();
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
        this.publish();
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
        this.publish();
    }

    /** Which engine the search bar uses on this browser. */
    public getSearchEngine(): SearchEngineId {
        return this.preferences.searchEngine;
    }

    /**
     *  Chooses the engine the search bar uses on this browser.
     *
     *  Takes effect at once, unlike the language: the bar draws itself from `preferences$`, so
     *  there is nothing to reload.
     *
     *  @param searchEngine one of the engines on offer; anything else means the default
     */
    public async setSearchEngine(searchEngine: string): Promise<void> {
        const wanted = normalizeSearchEngine(searchEngine);
        if (wanted === this.preferences.searchEngine) {
            return;
        }
        this.preferences = { ...this.preferences, searchEngine: wanted };
        this.LOG.debug("setSearchEngine", wanted);
        await this.datasource.save(DEVICE_PREFERENCES_KEY, this.preferences);
        this.publish();
    }

    /** Which theme this browser is set to, which may be "auto". */
    public getTheme(): ThemeId {
        return this.preferences.theme;
    }

    /**
     *  Chooses the theme this browser draws the page in, and puts it in force at once - unlike
     *  the language there is nothing to rebuild, the stylesheet repaints itself. Other open
     *  pages follow through `preferences$`, which `followTheme` keeps applied.
     *
     *  @param theme one of the themes on offer; anything else means following the system
     */
    public async setTheme(theme: string): Promise<void> {
        const wanted = normalizeTheme(theme);
        if (wanted === this.preferences.theme) {
            return;
        }
        this.preferences = { ...this.preferences, theme: wanted };
        this.LOG.debug("setTheme", wanted);
        await this.datasource.save(DEVICE_PREFERENCES_KEY, this.preferences);
        this.publish();
    }

    /**
     *  Draws the page in the stored theme, now and whenever it changes - here or in another
     *  page of this browser. Called before anything is drawn, beside `applyScale()`.
     */
    public followTheme(): void {
        this.preferences$.subscribe(preferences =>
            applyThemeTo(document.documentElement, preferences.theme));
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

/** Stored preferences as this version reads them: every field present and within range. */
function normalizePreferences(stored?: Partial<DevicePreferences> | null): DevicePreferences {
    return {
        scale: normalizeScale(stored?.scale ?? DEFAULT_SCALE),
        language: normalizeLanguagePreference(stored?.language),
        dateFormat: normalizeDateFormat(stored?.dateFormat),
        searchEngine: normalizeSearchEngine(stored?.searchEngine),
        closedTabsOpenDelay: normalizeClosedTabsOpenDelay(
            stored?.closedTabsOpenDelay ?? DEFAULT_CLOSED_TABS_OPEN_DELAY),
        sidePanelCard: normalizeSidePanelCard(stored?.sidePanelCard),
        keepSidePanelOpen: stored?.keepSidePanelOpen === true,
        // Anything but an explicit false is on: a browser that never answered synchronised.
        syncEnabled: stored?.syncEnabled !== false,
        theme: normalizeTheme(stored?.theme)
    };
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

/**
 *  Marks a root element with the theme it is drawn in. The stylesheet does the rest: every
 *  colour is a `light-dark()` pair, and `data-theme` decides the element's `color-scheme`,
 *  which is what picks one of the two - "auto" leaves it to the operating system.
 */
export function applyThemeTo(root: HTMLElement, theme: ThemeId): void {
    root.dataset.theme = normalizeTheme(theme);
}

export const devicePreferencesRepository = new DevicePreferencesRepository();
