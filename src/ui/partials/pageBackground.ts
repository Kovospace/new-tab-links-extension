import { backgroundImageRepository } from '../../backend/repository/BackgroundImageRepository';
import { ObservableValue } from '../../utils/observableValue';

/** Turns a stored picture (a data URL) into an address the stylesheet can be handed. */
export type PictureAddress = {
  of(dataUrl: string): string;
  release(address: string): void;
};

/**
 * Decodes the data URL into a Blob and hands out a `blob:` address for it - a few dozen
 * characters, whatever the size of the picture.
 */
export const objectUrlAddress: PictureAddress = {
  of(dataUrl) {
    const comma = dataUrl.indexOf(',');
    const header = dataUrl.slice(0, comma);
    const body = dataUrl.slice(comma + 1);
    const type = /^data:([^;,]+)/.exec(header)?.[1] ?? 'application/octet-stream';
    const bytes = header.includes(';base64')
      ? Uint8Array.from(atob(body), character => character.charCodeAt(0))
      : new TextEncoder().encode(decodeURIComponent(body));
    return URL.createObjectURL(new Blob([bytes], { type }));
  },
  release(address) {
    URL.revokeObjectURL(address);
  }
};

/**
 * What is behind the new tab page: the user's own picture, when they have chosen one, on any
 * account.
 *
 * **Handed to the stylesheet, not painted here.** The root gets `has-custom-background` and the
 * picture as `--page-background-image`; main.css draws it on a fixed layer of its own
 * (`html.has-custom-background::before`), covering the whole window. Set as the root's own
 * background instead, it was repainted behind every hover - see the note there.
 *
 * **As a `blob:` address, never as the data URL.** Chromium refuses a custom property value
 * of about two megabytes or more, and does it silently: the property simply stays empty. A 4K
 * picture is a data URL of two to four megabytes, so the large built-in backgrounds were stored
 * and never drawn, while the small ones worked. The stored data URL is turned into a Blob, and
 * the stylesheet is handed its short address; the previous one is released each time.
 */
export class PageBackground {

  private unsubscribe: (() => void) | null = null;

  /** The address handed out for the picture shown now, to release when it changes. */
  private shownAddress: string | null = null;

  /**
   * @param image$  the user's own picture, if any; the stored one in normal use
   * @param address how the picture is handed to the stylesheet; injectable, since jsdom has no
   *                `URL.createObjectURL`
   */
  constructor(
    private readonly image$: ObservableValue<string | null> = backgroundImageRepository.image$,
    private readonly address: PictureAddress = objectUrlAddress
  ) {}

  /** Puts the picture behind the page and keeps it current. */
  public render(): void {
    this.unsubscribe = this.image$.subscribe(picture => this.show(picture));
  }

  private show(picture: string | null): void {
    const root = document.documentElement;
    this.releaseShown();
    if (picture) {
      this.shownAddress = this.address.of(picture);
      root.classList.add('has-custom-background');
      root.style.setProperty('--page-background-image', `url("${this.shownAddress}")`);
    } else {
      root.classList.remove('has-custom-background');
      root.style.removeProperty('--page-background-image');
    }
  }

  private releaseShown(): void {
    if (this.shownAddress) {
      this.address.release(this.shownAddress);
      this.shownAddress = null;
    }
  }

  public dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.releaseShown();
  }
}
