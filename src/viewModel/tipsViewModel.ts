import { ProfileRepository, profileRepository } from "../backend/repository/ProfileRepository";
import { ProfileSettings, settingsOf } from "../backend/entity/ProfileSettings";
import { MAX_DISMISSED_TIPS } from "../backend/sync/SyncContracts";

import { buttonLabelOf, randomTipIndex, textOf, TIPS, urlOf } from "../ui/tips/tipsCatalogue";
import { Logger } from "../utils/logger";
import { ObservableValue } from "../utils/observableValue";

/** The tip on screen, as the bar draws it. */
export interface TipDTO {

    /** Which tip this is, so a redraw of the same tip can be recognised. */
    id: string;

    /** The sentence, in the reader's language. */
    text: string;

    /** Where "tell me more" leads, or null when the tip explains itself. */
    url: string | null;

    /** What the button says, when the tip names its own words for it; null means "tell me more". */
    buttonLabel: string | null;

    /** Whether there is more than one tip left to show, which is what makes the arrows worth drawing. */
    navigable: boolean;
}

/** What the bar shows: a tip, or nothing at all because tips are dismissed. */
export interface TipsDTO {
    visible: boolean;
    tip: TipDTO | null;
}

/**
 *  View model behind the tips on the workspace background.
 *
 *  It does not extend AbstractViewModel: tips are not part of AppState. What it watches is the
 *  profile registry, because whether tips are shown is one of that profile's settings - so
 *  turning them back on in Settings puts them back without a reload, and dismissing them takes
 *  them away on every device the profile is signed in on.
 *
 *  **Which tip is on screen is not stored anywhere.** A tip is chosen at random when the page
 *  opens, and stepping through them lasts as long as the tab does. Remembering the position
 *  would mean the same tip every morning until somebody clicked, which is the opposite of what
 *  a tip is for; and it would be a write to the profile - and so a push to the account - for
 *  pressing an arrow.
 *
 *  **A tip dismissed with "I know" is skipped, not removed.** The index still counts every
 *  tip in the file; landing on a dismissed one moves on to the next that is not, in the
 *  direction of travel. That keeps the arrows' order the file's order however many are gone.
 */
export class TipsViewModel {

    private LOG: Logger = new Logger("TipsViewModel");

    private readonly profiles: ProfileRepository;

    /** Which tip is on screen. Starts somewhere random; -1 when there are no tips. */
    private index: number;

    private unsubscribe: (() => void) | null = null;

    public readonly observables = {
        tips: new ObservableValue<TipsDTO>({ visible: false, tip: null })
    };

    /**
     *  @param profiles the profile registry; the singleton in normal use
     *  @param random   source of randomness, injectable so a test can be certain of the tip
     */
    constructor(
        profiles: ProfileRepository = profileRepository,
        random: () => number = Math.random
    ) {
        this.profiles = profiles;
        this.index = randomTipIndex(random);
    }

    /** Starts following the profile's settings, and shows the first tip. */
    public initialize(): void {
        // Subscribing fires immediately, which is what draws the first tip; it fires again
        // whenever the setting changes, here or on another device.
        this.unsubscribe = this.profiles.profiles$.subscribe(() => this.refresh());
    }

    /** Stops following. */
    public dispose(): void {
        this.unsubscribe?.();
        this.unsubscribe = null;
    }

    /** Moves to the next tip, wrapping round the end. */
    public next(): void {
        this.step(1);
    }

    /** Moves to the previous tip, wrapping round the beginning. */
    public previous(): void {
        this.step(-1);
    }

    /** Dismisses the tips for this profile, which Settings can undo. */
    public async hide(): Promise<void> {
        this.LOG.debug("hide", "Tips dismissed for this profile");
        await this.profiles.updateSettings({ hideTips: true });
        this.refresh();
    }

    /**
     *  Dismisses the tip on screen for good ("I know"), and moves on to the next one.
     *
     *  Stored on the profile, so it reaches every device. The list is bounded here, where it
     *  is written - never where it is read, since a pull has to store what the account holds:
     *  identifiers of tips this build no longer has are dropped, and past the account's limit
     *  the oldest dismissal gives way.
     */
    public async dismissCurrent(): Promise<void> {
        const tip = this.observables.tips.get().tip;
        if (!tip) {
            return;
        }
        this.LOG.debug("dismissCurrent", tip.id);

        const known = new Set(TIPS.map(candidate => candidate.id));
        const dismissedTips = [
            ...this.currentSettings().dismissedTips.filter(id => known.has(id) && id !== tip.id),
            tip.id
        ].slice(-MAX_DISMISSED_TIPS);

        await this.profiles.updateSettings({ dismissedTips });
        this.refresh();
    }

    /** Opens what the current tip has to say for itself, if it has anywhere to point. */
    public openMore(): void {
        const url = this.observables.tips.get().tip?.url;
        if (url) {
            this.LOG.debug("openMore", url);
            chrome.tabs.create({ url });
        }
    }

    private step(by: number): void {
        if (TIPS.length === 0) {
            return;
        }
        this.index = this.wrap(this.index + by);
        this.settleOnShowableTip(by);
        this.refresh();
    }

    /**
     *  Moves the index off a dismissed tip, in the given direction, wrapping round.
     *
     *  @param direction 1 to look forwards, -1 backwards
     *  @return whether a tip that is not dismissed was found; false when every one is
     */
    private settleOnShowableTip(direction: number): boolean {
        const dismissed = new Set(this.currentSettings().dismissedTips);
        for (let checked = 0; checked < TIPS.length; checked++) {
            if (!dismissed.has(TIPS[this.index].id)) {
                return true;
            }
            this.index = this.wrap(this.index + direction);
        }
        return false;
    }

    private wrap(index: number): number {
        return (index % TIPS.length + TIPS.length) % TIPS.length;
    }

    private currentSettings(): ProfileSettings {
        return settingsOf(
            this.profiles.getProfiles().find(
                profile => profile.id === this.profiles.getActiveProfileId()));
    }

    private refresh(): void {
        this.observables.tips.set(this.describe());
    }

    private describe(): TipsDTO {

        const settings = this.currentSettings();

        // Forwards, so that "I know" is followed by the tip after the one dismissed.
        if (settings.hideTips || TIPS.length === 0 || !this.settleOnShowableTip(1)) {
            return { visible: false, tip: null };
        }

        const tip = TIPS[this.index];
        const dismissed = new Set(settings.dismissedTips);
        const remaining = TIPS.filter(candidate => !dismissed.has(candidate.id)).length;

        return {
            visible: true,
            tip: {
                id: tip.id,
                text: textOf(tip),
                url: urlOf(tip),
                buttonLabel: buttonLabelOf(tip),
                navigable: remaining > 1
            }
        };
    }
}
