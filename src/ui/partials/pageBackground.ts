import { backgroundImageRepository } from '../../backend/repository/BackgroundImageRepository';
import { ObservableValue } from '../../utils/observableValue';

/**
 * What is behind the new tab page: the user's own picture, when they have chosen one, on any
 * account.
 *
 * **Handed to the stylesheet, not painted here.** The root gets `has-custom-background` and the
 * picture as `--page-background-image`; main.css draws it on a fixed layer of its own
 * (`html.has-custom-background::before`), covering the whole window. Set as the root's own
 * background instead, it was repainted behind every hover - see the note there.
 */
export class PageBackground {

  private unsubscribe: (() => void) | null = null;

  /**
   * @param image$ the user's own picture, if any; the stored one in normal use
   */
  constructor(
    private readonly image$: ObservableValue<string | null> = backgroundImageRepository.image$
  ) {}

  /** Puts the picture behind the page and keeps it current. */
  public render(): void {
    this.unsubscribe = this.image$.subscribe(picture => this.show(picture));
  }

  private show(picture: string | null): void {
    const root = document.documentElement;
    if (picture) {
      root.classList.add('has-custom-background');
      root.style.setProperty('--page-background-image', `url("${picture}")`);
    } else {
      root.classList.remove('has-custom-background');
      root.style.removeProperty('--page-background-image');
    }
  }

  public dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }
}
