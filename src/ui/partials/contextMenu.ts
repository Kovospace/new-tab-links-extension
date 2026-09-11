import { ELEM_OPTIONS_MENU, ELEM_OPTIONS_MENU_ITEM } from "../../constants";

export type ContextMenuAction = {
  label: string;
  onClick: () => void;
  /** Renders the item in a danger/destructive style */
  danger?: boolean;
}

class ContextMenu {

  private el: HTMLElement | null = null;

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
      document.body.appendChild(this.el);
    }
    return this.el;
  }

  show(x: number, y: number, actions: ContextMenuAction[]): void {
    if (!actions.length) return;

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
    el.classList.add('visible');

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
    this.el?.classList.remove('visible');
    document.removeEventListener('mousedown', this.onOutsideMouseDown);
    document.removeEventListener('keydown', this.onEscapeKey);
  }
}

export const contextMenu = new ContextMenu();