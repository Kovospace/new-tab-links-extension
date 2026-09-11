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
 */
export class AdsBar {

  private container: HTMLElement | null = null;

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
  }

  /** The element an advertisement would be put into, or null before it is drawn. */
  public getSlot(): HTMLElement | null {
    return this.container;
  }

  public dispose(): void {
    this.container?.remove();
    this.container = null;
  }
}
