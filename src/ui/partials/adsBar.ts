import { buildWebsiteUrl, SYNC_CONFIGURATION, WEBSITE_PATHS } from '../../backend/sync/SyncConfiguration';
import { currentLanguage } from '../../i18n/i18n';
import { accountStandingRepository } from '../../backend/sync/AccountStandingRepository';
import { ObservableValue } from '../../utils/observableValue';

/** What the slot page posts to its parent once it has drawn something worth showing. */
export const AD_SLOT_READY_MESSAGE = 'tabilinks-ad-slot-ready';

/**
 * The space an advertisement goes in.
 *
 * Below the tips, at the foot of the workspace, and it holds its space whether or not there is
 * anything in it - which is the point of reserving it: the day something lands here, nothing
 * around it moves.
 *
 * Its own partial rather than a few lines inside the workspace component, for the same reason
 * the tips are: what goes in here is going to grow a loader, a size that depends on the window,
 * and a reason not to draw at all for somebody who has paid not to see it. None of that belongs
 * in the component that draws the workspace.
 *
 * **What is in it is a page on the website, in an iframe** (`WEBSITE_PATHS.adSlot`). Our own
 * promotion today and an ad network tomorrow, without an extension release - and without
 * remotely hosted code, which MV3 forbids: whatever runs in the frame runs on the website's
 * origin, not the extension's. The frame is sandboxed to what an ad needs - scripts, and links
 * that open a new tab - and is sent no referrer.
 *
 * **It stays invisible until the page says it is ready**, by posting `AD_SLOT_READY_MESSAGE`.
 * `load` cannot tell that apart: an offline browser loads its own "cannot reach this page"
 * into the frame and fires `load` all the same, and that is not something to put at the foot
 * of somebody's links.
 *
 * **Not there at all for a premium account** - no frame, not even the reserved space: the space
 * is kept for the day an ad lands in it, and for a premium user that day never comes. The frame
 * is not even loaded, so the website does not hear about a premium user's new tabs either. It
 * follows the standing both ways: an upgrade takes it away, a lapsed subscription brings it back.
 */
export class AdsBar {

  private container: HTMLElement | null = null;

  /** Listens for the slot page saying it has drawn; removed with the bar. */
  private onMessage: ((event: MessageEvent) => void) | null = null;

  private frame: HTMLIFrameElement | null = null;
  private unsubscribe: (() => void) | null = null;

  /**
   * @param premium$ whether the account is premium; the account standing in normal use
   */
  constructor(
    private readonly premium$: ObservableValue<boolean> = accountStandingRepository.premium$
  ) {}

  /**
   * Draws the bar into a host.
   *
   * @param host where the bar lives; the workspace footer in normal use, after the tips
   */
  public render(host: HTMLElement): void {

    this.container = document.createElement('div');
    this.container.classList.add('ads-bar');

    // Named, so that whatever fills it can find it without knowing how the page is built.
    this.container.dataset.adSlot = 'workspace-footer';
    // Nothing to announce while it is empty, and an advertisement is not what somebody using
    // a screen reader came to a new tab page for.
    this.container.setAttribute('aria-hidden', 'true');

    host.appendChild(this.container);

    this.unsubscribe = this.premium$.subscribe(premium => this.showFor(premium));
  }

  /** Draws the slot for a free account and takes it away for a premium one. */
  private showFor(premium: boolean): void {
    if (!this.container) return;

    this.container.hidden = premium;
    if (premium) {
      this.removeFrame();
    } else if (!this.frame) {
      this.frame = this.buildFrame();
      this.container.appendChild(this.frame);
    }
  }

  private removeFrame(): void {
    if (this.onMessage) {
      window.removeEventListener('message', this.onMessage);
      this.onMessage = null;
    }
    this.frame?.remove();
    this.frame = null;
  }

  private buildFrame(): HTMLIFrameElement {
    const frame = document.createElement('iframe');
    frame.classList.add('ads-bar__frame');

    const url = new URL(buildWebsiteUrl(WEBSITE_PATHS.adSlot));
    url.searchParams.set('lang', currentLanguage());
    frame.src = url.href;

    frame.setAttribute('sandbox',
      'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox');
    frame.referrerPolicy = 'no-referrer';
    frame.title = 'Advertisement';
    // Out of the tab order, as the container is out of the accessibility tree.
    frame.tabIndex = -1;
    frame.hidden = true;

    const websiteOrigin = new URL(SYNC_CONFIGURATION.websiteBaseUrl).origin;
    this.onMessage = (event: MessageEvent) => {
      if (event.source === frame.contentWindow
          && event.origin === websiteOrigin
          && event.data === AD_SLOT_READY_MESSAGE) {
        frame.hidden = false;
      }
    };
    window.addEventListener('message', this.onMessage);

    return frame;
  }

  /** The element an advertisement would be put into, or null before it is drawn. */
  public getSlot(): HTMLElement | null {
    return this.container;
  }

  public dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.removeFrame();
    this.container?.remove();
    this.container = null;
  }
}
