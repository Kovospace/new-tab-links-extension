import { accountStandingRepository } from '../../backend/sync/AccountStandingRepository';
import { backgroundImageRepository } from '../../backend/repository/BackgroundImageRepository';
import { ObservableValue } from '../../utils/observableValue';

/**
 * What is behind the new tab page: the logo in the corner, or a premium user's own picture.
 *
 * **The logo is an element, not a background of main.** It carries a badge - FREE or PRO -
 * which is text, and text is not something a CSS background can hold. It sits in main's cell
 * of the page grid (see `.page-watermark` in main.css), under main's content rather than inside
 * it, so the links scroll over it and it stays in the corner.
 *
 * **Free and premium put it at different heights**, because a free page has the ad slot along
 * its foot and a premium one does not; the stylesheet keys that off `data-tier`.
 *
 * **A premium user's own picture replaces the logo** rather than having the logo drawn over it.
 * It is painted on the root element, covering the whole window. A picture stored while premium
 * is kept but not shown once the account is not - see `BackgroundImageRepository`.
 */
export class PageBackground {

  private watermark: HTMLElement | null = null;
  private badge: HTMLElement | null = null;
  private readonly unsubscribers: (() => void)[] = [];

  /**
   * @param premium$ whether the account is premium; the account standing in normal use
   * @param image$   the user's own picture, if any; the stored one in normal use
   */
  constructor(
    private readonly premium$: ObservableValue<boolean> = accountStandingRepository.premium$,
    private readonly image$: ObservableValue<string | null> = backgroundImageRepository.image$
  ) {}

  /**
   * Draws the logo into the page and keeps both it and the picture current.
   *
   * @param host the page's body
   */
  public render(host: HTMLElement): void {
    this.watermark = this.buildWatermark();
    host.appendChild(this.watermark);

    const redraw = () => this.redraw();
    this.unsubscribers.push(this.premium$.subscribe(redraw));
    this.unsubscribers.push(this.image$.subscribe(redraw));
  }

  private buildWatermark(): HTMLElement {
    const watermark = document.createElement('div');
    watermark.classList.add('page-watermark');
    // Decoration: nothing to announce and nothing to click.
    watermark.setAttribute('aria-hidden', 'true');

    const logo = document.createElement('img');
    logo.classList.add('page-watermark__logo');
    logo.src = '/icons/logo-512.png';
    logo.alt = '';
    logo.draggable = false;

    this.badge = document.createElement('span');
    this.badge.classList.add('page-watermark__badge');

    watermark.appendChild(logo);
    watermark.appendChild(this.badge);
    return watermark;
  }

  private redraw(): void {
    if (!this.watermark || !this.badge) return;

    const premium = this.premium$.get();
    const picture = premium ? this.image$.get() : null;

    this.watermark.dataset.tier = premium ? 'pro' : 'free';
    // A brand name, the same in every language, which is why it is not translated.
    this.badge.textContent = premium ? 'PRO' : 'FREE';
    this.watermark.hidden = picture !== null;

    const root = document.documentElement;
    if (picture) {
      root.classList.add('has-custom-background');
      root.style.backgroundImage = `url("${picture}")`;
    } else {
      root.classList.remove('has-custom-background');
      root.style.removeProperty('background-image');
    }
  }

  public dispose(): void {
    this.unsubscribers.splice(0).forEach(unsubscribe => unsubscribe());
    this.watermark?.remove();
    this.watermark = null;
    this.badge = null;
  }
}
