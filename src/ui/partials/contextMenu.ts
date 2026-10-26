import { CLASS_HAS_OPEN_MENU, ELEM_OPTIONS_MENU, ELEM_OPTIONS_MENU_ITEM } from "../../constants";
import { liftClosed, liftOpenAt, makePopover } from "./popover";

export type ContextMenuAction = {
  label: string;
  onClick: () => void;
  /** Renders the item in a danger/destructive style */
  danger?: boolean;
}

class ContextMenu {

  private el: HTMLElement | null = null;

  /** The element the open menu is about, marked so it keeps its hover look while it is open. */
  private owner: HTMLElement | null = null;

  private onOutsideMouseDown = (e: MouseEvent) => {
    if (!this.el?.contains(e.target as Node)) this.hide();
  };

  private onEscapeKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') this.hide();
  };

  private getEl(): HTMLElement {
    if (!this.el) {
      this.el = document.createElement(ELEM_OPTIONS_MENU);
      this.el.style.position = 'fixed';
      // In the top layer, like every menu - see popover.ts.
      makePopover(this.el);
      document.body.appendChild(this.el);
    }
    return this.el;
  }

  /**
   * @param owner what the menu is about - the link right-clicked - kept in its hover look while
   *              the menu is open, since the pointer leaves it for the menu
   */
  show(x: number, y: number, actions: ContextMenuAction[], owner?: HTMLElement): void {
    if (!actions.length) return;
    this.setOwner(owner ?? null);

    const el = this.getEl();
    el.replaceChildren();

    for (const action of actions) {
      const item = document.createElement(ELEM_OPTIONS_MENU_ITEM);
      item.textContent = action.label;
      if (action.danger) item.classList.add('danger');
      item.addEventListener('click', () => { this.hide(); action.onClick(); });
      el.appendChild(item);
    }

    // Initial position
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    el.classList.add('visible');
    liftOpenAt(el);

    // Correct overflow after layout
    requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        el.style.left = (x - rect.width) + 'px';
      }
      if (rect.bottom > window.innerHeight) {
        el.style.top = (y - rect.height) + 'px';
      }
    });

    document.addEventListener('mousedown', this.onOutsideMouseDown);
    document.addEventListener('keydown', this.onEscapeKey);
  }

  hide(): void {
    this.setOwner(null);
    this.el?.classList.remove('visible');
    if (this.el) liftClosed(this.el);
    document.removeEventListener('mousedown', this.onOutsideMouseDown);
    document.removeEventListener('keydown', this.onEscapeKey);
  }

  private setOwner(owner: HTMLElement | null): void {
    this.owner?.classList.remove(CLASS_HAS_OPEN_MENU);
    this.owner = owner;
    this.owner?.classList.add(CLASS_HAS_OPEN_MENU);
  }
}

export const contextMenu = new ContextMenu();