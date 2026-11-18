/**
 * The large flat icon buttons of the empty workspace's widget and of the page shown with no
 * workspace at all (#182): one tile per way forward, a 96x96 icon over its label (6em, so the
 * size slider scales it with everything else).
 *
 * The icons are drawn here as SVG elements in `currentColor`, so a tile's tone colours them and
 * both themes get them right. No picture file, no HTML string.
 */

/** The flat icons a tile can carry. */
export type TileIcon = 'group' | 'bookmarks' | 'sync' | 'cancel' | 'workspace' | 'backup' | 'examples';

/** How a tile is coloured: green for making something, red for the way out. */
export type TileTone = 'add' | 'plain' | 'danger';

export interface Tile {
  icon: TileIcon;
  label: string;
  tone: TileTone;
  onClick: () => void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Each icon as the outlines it is drawn with, on a 24x24 grid. */
const ICON_PATHS: Readonly<Record<TileIcon, readonly string[]>> = {
  // A column with a plus: a new group.
  group: ['M4 3h9v18H4z', 'M18 9v8', 'M14 13h8'],
  // A bookmark ribbon.
  bookmarks: ['M6 3h12v18l-6-5-6 5z'],
  // A cloud with two arrows: synchronising.
  sync: ['M7 18a5 5 0 0 1-.5-9.97A6 6 0 0 1 18 9a4.5 4.5 0 0 1 0 9z', 'M10 11v4l-1.5-1.5', 'M14 15v-4l1.5 1.5'],
  // A cross.
  cancel: ['M6 6l12 12', 'M18 6L6 18'],
  // A screen of columns with a plus: a new workspace.
  workspace: ['M2 5h14v14H2z', 'M6.5 5v14', 'M11 5v14', 'M20 9v6', 'M17 12h6'],
  // A document with an arrow coming out of it: links from a backup file.
  backup: ['M6 3h8l4 4v14H6z', 'M14 3v4h4', 'M12 18v-7', 'M9 14l3-3 3 3'],
  // Three filled-in columns of links: the example set.
  examples: ['M3 4h5v16H3z', 'M10 4h5v11h-5z', 'M17 4h4v14h-4z']
};

/** One flat icon, in the colour of the text around it. */
export function flatIcon(icon: TileIcon): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('welcome-tile__icon');
  for (const outline of ICON_PATHS[icon]) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', outline);
    svg.appendChild(path);
  }
  return svg;
}

/** The tiles, in a row that wraps. */
export function renderTiles(tiles: ReadonlyArray<Tile>): HTMLElement {
  const row = document.createElement('div');
  row.classList.add('welcome-tiles');
  for (const tile of tiles) {
    const button = document.createElement('button');
    button.type = 'button';
    button.classList.add('welcome-tile', `welcome-tile--${tile.tone}`);
    button.dataset.icon = tile.icon;
    const label = document.createElement('span');
    label.classList.add('welcome-tile__label');
    label.textContent = tile.label;
    button.append(flatIcon(tile.icon), label);
    button.addEventListener('click', tile.onClick);
    row.appendChild(button);
  }
  return row;
}
