import { TipsDTO, TipsViewModel } from '../../viewModel/tipsViewModel';
import { TrashViewModel } from '../../viewModel/trashViewModel';
import { confirmDestructiveAction } from './confirmations';
import { makeContainerTarget } from '../dragAndDrop/dragAndDrop';
import { ICON } from './wrappedHtmlElements';
import { t } from '../../i18n/i18n';

/**
 * The bar along the bottom of the workspace, which has two faces.
 *
 * **The tip.** Deliberately quiet: one sentence, dimmed, out of the way of the columns, and its
 * controls appear only when the pointer is over it. A tip that competes with the links for
 * attention is a tip that gets dismissed on the first day - and dismissing is a per-profile
 * setting that follows the user to every device, so it is not a decision to provoke. It draws
 * itself from the view model rather than deciding anything: which tip is on screen, whether
 * tips are shown at all, and where "tell me more" leads are all its business.
 *
 * **The trash.** While a link is being dragged the same bar turns red and offers to destroy it.
 * The same bar, and not a second one that appears beside it, because the thing that says "this
 * is now dangerous" is the colour changing under something that was already there - and a
 * colour cannot transition between two elements.
 *
 * Both faces are built once and the stylesheet shows one of them, keyed off the kind of drag
 * the root element names. Nothing here listens for a drag: what would be gained is a class this
 * component sets itself, and what would be paid is two document listeners per page and a
 * second opinion about when a drag is in flight.
 *
 * **Only a link.** A subgroup carries its links with it and a group carries both; dropping
 * either here would destroy a great deal on one gesture, and neither is what was asked for. A
 * closed tab is not destroyed here either - it is a record of something that happened, and the
 * panel it came from has its own way of forgetting one.
 */
export class TipsBar {

  private readonly viewModel: TipsViewModel;
  private readonly trash: TrashViewModel;

  private container: HTMLElement | null = null;

  /** The tip half, which is what a redraw replaces; the trash half outlives every redraw. */
  private tipEl: HTMLElement | null = null;

  private unsubscribe: (() => void) | null = null;

  /**
   * @param viewModel supplies the tip and stores the dismissal; injectable for testing
   * @param trash     destroys a link dropped on the bar; injectable for testing
   */
  constructor(
    viewModel: TipsViewModel = new TipsViewModel(),
    trash: TrashViewModel = new TrashViewModel()
  ) {
    this.viewModel = viewModel;
    this.trash = trash;
  }

  /**
   * Draws the bar into a host and keeps it current.
   *
   * @param host where the bar lives; the page footer in normal use
   */
  public render(host: HTMLElement): void {
    this.container = document.createElement('div');
    this.container.classList.add('tips-bar');

    // Two faces, both present from the start. Building the trash half on demand would mean
    // building it during a dragstart, which is the one moment in a drag when the browser is
    // measuring the thing being picked up.
    this.tipEl = document.createElement('span');
    this.tipEl.classList.add('tips-bar__tip');
    this.container.appendChild(this.tipEl);
    this.container.appendChild(this.buildTrash());

    // Links only - see the note on the class. A drop is not confirmed, for the same reason
    // the delete button on a link is not.
    makeContainerTarget(this.container, 'link', id => void this.trash.destroyLink(id));

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
    this.tipEl = null;
  }

  private draw(tips: TipsDTO): void {
    if (!this.tipEl) return;
    this.tipEl.replaceChildren();

    // Hidden rather than empty: an empty face still takes its height, and the page would keep
    // a strip of nothing along the bottom for somebody who asked for no tips. It is the face
    // that is hidden and not the bar, because the bar is still the trash - the stylesheet
    // draws it again for as long as a link is in the air, and nothing else.
    this.tipEl.hidden = !tips.visible || !tips.tip;
    if (!tips.visible || !tips.tip) {
      return;
    }

    const text = document.createElement('span');
    text.classList.add('tips-bar__text');
    text.textContent = tips.tip.text;
    this.tipEl.appendChild(text);

    if (tips.tip.url) {
      this.tipEl.appendChild(this.button(
        tips.tip.buttonLabel ?? t('tips.tellMeMore'),
        ['tips-bar__more'],
        t('tips.tellMeMoreTooltip'),
        () => this.viewModel.openMore()));
    }

    // "I know" sits with "tell me more" rather than with the hover controls: it answers this
    // tip, where they manage tips. Not confirmed - it takes one tip away, not all of them, and
    // what it takes is something the reader just said they already know.
    this.tipEl.appendChild(this.button(
      t('tips.acknowledge'),
      ['tips-bar__more', 'tips-bar__acknowledge'],
      t('tips.acknowledgeTooltip'),
      () => void this.viewModel.dismissCurrent()));

    // The controls, which the stylesheet keeps invisible until the bar is hovered. They are
    // built either way rather than on hover, so that the bar does not change width under the
    // pointer as it arrives.
    const controls = document.createElement('span');
    controls.classList.add('tips-bar__controls');

    if (tips.tip.navigable) {
      controls.appendChild(this.button(
        ICON.MOVE_UP, ['tips-bar__control'], t('tips.previous'), () => this.viewModel.previous()));
      controls.appendChild(this.button(
        ICON.MOVE_DOWN, ['tips-bar__control'], t('tips.next'), () => this.viewModel.next()));
    }

    controls.appendChild(this.button(
      ICON.CLOSE, ['tips-bar__control'], t('tips.hide'), () => void this.confirmHide()));

    this.tipEl.appendChild(controls);
  }

  /**
   * The face the bar wears while a link is being carried.
   *
   * The sentence is in the document rather than in the stylesheet's `content`, unlike the
   * "TIP:" in front of a tip: this one is a sentence addressed to the user, and a sentence in
   * a stylesheet is a sentence no translator will ever be handed.
   */
  private buildTrash(): HTMLElement {
    const trash = document.createElement('span');
    trash.classList.add('tips-bar__trash');

    const icon = document.createElement('span');
    icon.classList.add('tips-bar__trash-icon');
    icon.textContent = ICON.TRASH;
    icon.setAttribute('aria-hidden', 'true');

    const text = document.createElement('span');
    text.textContent = t('tips.trash');

    trash.append(icon, text);
    return trash;
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
      t('tips.hideConfirmation.title'),
      t('tips.hideConfirmation.message'),
      t('tips.hideConfirmation.confirm'));

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
