import { SearchBarDTO, SearchBarViewModel, SearchEngineDTO } from '../../viewModel/searchBarViewModel';
import { FaviconsHandler } from '../backgroundWorkerCommands/faviconsHandler';
import { t } from '../../i18n/i18n';

const ICON_DEFAULT = '/gfx/favicon-default.svg';
const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * The search bar in the workspace heading:
 * `[engine icon ▾] [what to search for] [search]`.
 *
 * **Built once and moved, never rebuilt.** The heading is redrawn whenever the workspace
 * changes - renamed, switched - and a bar rebuilt with it would throw away whatever was half
 * typed into it. The workspace component places the same element into every redraw.
 *
 * **A `<form>`, so Enter is the browser's own.** Submitting from the field and pressing the
 * button are one event, and nothing here listens for a key to decide which.
 *
 * **Results replace this page**, as a link clicked on it does: a new tab is where a search
 * starts, so it is the tab the results belong in.
 *
 * **The browser's own engine is first and the default** - the Chrome Web Store's rule; see
 * `SearchEngines`. Chrome does not say which engine that is, so it is drawn with a plain
 * magnifying glass and called "Default search engine". The others are drawn with their own
 * favicons, fetched through the same worker and cache as every link's - no brand artwork is
 * bundled, and an engine added to the list needs no image.
 */
export class SearchBar {

  private readonly viewModel: SearchBarViewModel;

  private form: HTMLFormElement | null = null;
  private input: HTMLInputElement | null = null;
  private engineButton: HTMLButtonElement | null = null;
  private engineIcon: HTMLElement | null = null;
  private engineList: HTMLElement | null = null;

  /** Which engine the button's icon was last drawn for, so a late favicon cannot overwrite a newer choice. */
  private drawnEngineId: string | null = null;

  /** Favicons already asked for, by home page; the list and the button share them. */
  private readonly icons = new Map<string, Promise<string | null>>();

  /**
   * @param viewModel which engine is in use, and where a query goes; injectable for testing
   */
  constructor(viewModel: SearchBarViewModel = new SearchBarViewModel()) {
    this.viewModel = viewModel;
  }

  /** The bar, built on first use and the same element every time after. */
  public element(): HTMLElement {
    if (!this.form) {
      this.form = this.build();
      this.viewModel.initialize();
      this.viewModel.observables.search.subscribe(search => this.draw(search));
    }
    return this.form;
  }

  private build(): HTMLFormElement {
    const form = document.createElement('form');
    form.classList.add('search-bar');
    form.setAttribute('role', 'search');
    form.addEventListener('submit', event => {
      event.preventDefault();
      this.submit();
    });

    const engine = document.createElement('div');
    engine.classList.add('search-bar__engine');

    this.engineButton = document.createElement('button');
    this.engineButton.type = 'button';
    this.engineButton.classList.add('search-bar__engine-button');
    this.engineButton.setAttribute('aria-haspopup', 'listbox');
    this.engineButton.setAttribute('aria-expanded', 'false');
    this.engineButton.addEventListener('click', () => this.toggleEngineList());

    this.engineIcon = document.createElement('span');
    this.engineIcon.classList.add('search-bar__engine-icon');
    this.engineButton.appendChild(this.engineIcon);
    const caret = document.createElement('span');
    caret.classList.add('search-bar__caret');
    caret.textContent = '▾';
    this.engineButton.appendChild(caret);

    this.engineList = document.createElement('ul');
    this.engineList.classList.add('search-bar__engines');
    this.engineList.setAttribute('role', 'listbox');
    this.engineList.hidden = true;

    engine.append(this.engineButton, this.engineList);

    this.input = document.createElement('input');
    this.input.type = 'search';
    this.input.classList.add('search-bar__input');
    this.input.enterKeyHint = 'search';
    this.input.autocomplete = 'off';
    this.input.spellcheck = false;

    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.classList.add('search-bar__submit');
    submit.title = t('search.submit');
    submit.setAttribute('aria-label', t('search.submit'));
    submit.appendChild(magnifierGlyph());

    form.append(engine, this.input, submit);

    // Closing the list: a click anywhere else, or Escape. Listened for on the document, and
    // for the life of the page, because the bar lives that long too.
    document.addEventListener('click', event => {
      if (!engine.contains(event.target as Node)) this.closeEngineList();
    });
    form.addEventListener('keydown', event => {
      if (event.key === 'Escape' && this.isEngineListOpen()) {
        event.preventDefault();
        this.closeEngineList();
        this.engineButton?.focus();
      }
    });

    return form;
  }

  /** Redraws everything that depends on which engine is in use. */
  private draw(search: SearchBarDTO): void {
    const { engine, engines } = search;

    this.input!.placeholder = engine.homeUrl === null
      ? t('search.placeholderBrowser')
      : t('search.placeholder', { engine: engine.label });
    this.input!.setAttribute('aria-label', this.input!.placeholder);

    const choose = t('search.chooseEngine', { engine: engine.label });
    this.engineButton!.title = choose;
    this.engineButton!.setAttribute('aria-label', choose);

    this.drawnEngineId = engine.id;
    this.engineIcon!.replaceChildren(this.engineGlyph(engine, () => this.drawnEngineId === engine.id));

    this.engineList!.replaceChildren(...engines.map(one => this.engineOption(one, one.id === engine.id)));
  }

  private engineOption(engine: SearchEngineDTO, selected: boolean): HTMLElement {
    const item = document.createElement('li');

    const button = document.createElement('button');
    button.type = 'button';
    button.classList.add('search-bar__engine-option');
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', String(selected));
    if (selected) button.classList.add('active');

    const icon = this.engineGlyph(engine, () => true);

    const name = document.createElement('span');
    name.textContent = engine.label;

    button.append(icon, name);
    button.addEventListener('click', () => {
      this.closeEngineList();
      void this.viewModel.chooseEngine(engine.id);
      // Back to the field: choosing an engine is a step on the way to typing a query.
      this.input?.focus();
    });

    item.appendChild(button);
    return item;
  }

  private submit(): void {
    void this.viewModel.search(this.input?.value ?? '').then(searched => {
      if (!searched) this.input?.focus();
    });
  }

  private toggleEngineList(): void {
    if (this.isEngineListOpen()) {
      this.closeEngineList();
    } else {
      this.engineList!.hidden = false;
      this.engineButton!.setAttribute('aria-expanded', 'true');
    }
  }

  private closeEngineList(): void {
    if (!this.engineList || this.engineList.hidden) return;
    this.engineList.hidden = true;
    this.engineButton!.setAttribute('aria-expanded', 'false');
  }

  private isEngineListOpen(): boolean {
    return !!this.engineList && !this.engineList.hidden;
  }

  /**
   * What an engine is drawn with: its favicon, or a magnifying glass for the browser's own
   * engine, which Chrome does not name.
   *
   * @param stillWanted asked when the favicon arrives; false once another engine is drawn
   */
  private engineGlyph(engine: SearchEngineDTO, stillWanted: () => boolean): Element {
    if (engine.homeUrl === null) {
      return magnifierGlyph();
    }
    const img = document.createElement('img');
    img.width = 16;
    img.height = 16;
    img.alt = '';
    img.src = ICON_DEFAULT;
    img.draggable = false;
    void this.iconOf(engine.homeUrl).then(src => { if (src && stillWanted()) img.src = src; });
    return img;
  }

  private iconOf(homeUrl: string): Promise<string | null> {
    let icon = this.icons.get(homeUrl);
    if (!icon) {
      icon = FaviconsHandler.handleIconDownloadAndCache(homeUrl).catch(() => null);
      this.icons.set(homeUrl, icon);
    }
    return icon;
  }
}

/**
 * A magnifying glass, drawn rather than typed: the text glyphs for one are either emoji,
 * which ignore the colour around them, or missing from the fonts a page can count on.
 */
function magnifierGlyph(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');

  const lens = document.createElementNS(SVG_NS, 'circle');
  lens.setAttribute('cx', '10.5');
  lens.setAttribute('cy', '10.5');
  lens.setAttribute('r', '6.5');

  const handle = document.createElementNS(SVG_NS, 'line');
  handle.setAttribute('x1', '15.5');
  handle.setAttribute('y1', '15.5');
  handle.setAttribute('x2', '21');
  handle.setAttribute('y2', '21');

  svg.append(lens, handle);
  return svg;
}
