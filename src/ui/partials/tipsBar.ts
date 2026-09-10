import { TipsDTO, TipsViewModel } from '../../viewModel/tipsViewModel';
import { confirmDestructiveAction } from './confirmations';
import { ICON } from './wrappedHtmlElements';

/**
 * The tips along the bottom of the workspace.
 *
 * Deliberately quiet: one sentence, dimmed, out of the way of the columns, and its controls
 * appear only when the pointer is over it. A tip that competes with the links for attention is
 * a tip that gets dismissed on the first day - and dismissing is a per-profile setting that
 * follows the user to every device, so it is not a decision to provoke.
 *
 * It draws itself from the view model rather than deciding anything: which tip is on screen,
 * whether tips are shown at all, and where "tell me more" leads are all its business.
 */
export class TipsBar {

  private readonly viewModel: TipsViewModel;

  private container: HTMLElement | null = null;
  private unsubscribe: (() => void) | null = null;

  /**
   * @param viewModel supplies the tip and stores the dismissal; injectable for testing
   */
  constructor(viewModel: TipsViewModel = new TipsViewModel()) {
    this.viewModel = viewModel;
  }

  /**
   * Draws the bar into a host and keeps it current.
   *
   * @param host where the bar lives; the page footer in normal use
   */
  public render(host: HTMLElement): void {
    this.container = document.createElement('div');
    this.container.classList.add('tips-bar');
    host.appendChild(this.container);

    this.unsubscribe = this.viewModel.observables.tips.subscribe(tips => this.draw(tips));
    this.viewModel.initialize();
  }

  /** Detaches the subscriptions; the bar is rebuilt on the next render. */
  public dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.viewModel.dispose();
    this.container?.remove();
    this.container = null;
  }

  private draw(tips: TipsDTO): void {
    if (!this.container) return;
    this.container.replaceChildren();

    // Hidden rather than empty: an empty bar still takes its height, and the page would keep
    // a strip of nothing along the bottom for somebody who asked for no tips.
    this.container.hidden = !tips.visible || !tips.tip;
    if (!tips.visible || !tips.tip) {
      return;
    }

    const text = document.createElement('span');
    text.classList.add('tips-bar__text');
    text.textContent = tips.tip.text;
    this.container.appendChild(text);

    if (tips.tip.url) {
      this.container.appendChild(this.button(
        'Tell me more',
        ['tips-bar__more'],
        'Read more about this',
        () => this.viewModel.openMore()));
    }

    // The controls, which the stylesheet keeps invisible until the bar is hovered. They are
    // built either way rather than on hover, so that the bar does not change width under the
    // pointer as it arrives.
    const controls = document.createElement('span');
    controls.classList.add('tips-bar__controls');

    if (tips.tip.navigable) {
      controls.appendChild(this.button(
        ICON.MOVE_UP, ['tips-bar__control'], 'Previous tip', () => this.viewModel.previous()));
      controls.appendChild(this.button(
        ICON.MOVE_DOWN, ['tips-bar__control'], 'Next tip', () => this.viewModel.next()));
    }

    controls.appendChild(this.button(
      ICON.CLOSE, ['tips-bar__control'], 'Hide tips', () => void this.confirmHide()));

    this.container.appendChild(controls);
  }

  /**
   * Asks before dismissing, because the answer is remembered.
   *
   * Hiding is a setting on the profile, so it follows the user to every device they are signed
   * in on - and the way back is a screen they have not necessarily found yet, which is why the
   * question says where it is.
   */
  private async confirmHide(): Promise<void> {
    const confirmed = await confirmDestructiveAction(
      'Hide tips?',
      'Tips will stop appearing on this profile, on every device you are signed in on. '
      + 'You can bring them back from Settings in the application menu.',
      'Hide them');

    if (confirmed) {
      await this.viewModel.hide();
    }
  }

  private button(
    text: string,
    classes: string[],
    tooltip: string,
    onClick: () => void
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.classList.add(...classes);
    button.textContent = text;
    button.title = tooltip;
    button.addEventListener('click', onClick);
    return button;
  }
}
