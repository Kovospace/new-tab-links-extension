import { ProfileRepository, profileRepository } from "../backend/repository/ProfileRepository";
import { settingsOf } from "../backend/entity/ProfileSettings";

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

    /** Whether there is more than one tip, which is what makes the arrows worth drawing. */
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
        this.index = (this.index + by + TIPS.length) % TIPS.length;
        this.refresh();
    }

    private refresh(): void {
        this.observables.tips.set(this.describe());
    }

    private describe(): TipsDTO {

        const hidden = settingsOf(
            this.profiles.getProfiles().find(
                profile => profile.id === this.profiles.getActiveProfileId())
        ).hideTips;

        const tip = TIPS[this.index];

        if (hidden || !tip) {
            return { visible: false, tip: null };
        }

        return {
            visible: true,
            tip: {
                id: tip.id,
                text: textOf(tip),
                url: urlOf(tip),
                buttonLabel: buttonLabelOf(tip),
                navigable: TIPS.length > 1
            }
        };
    }
}
