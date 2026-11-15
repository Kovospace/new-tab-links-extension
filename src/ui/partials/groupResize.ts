import { GroupSize, MIN_GROUP_HEIGHT, MIN_GROUP_WIDTH } from '../../backend/repository/GroupSizeRepository';
import { CLASS_GROUP_RESIZED, CLASS_GROUP_RESIZE_HANDLE, CLASS_GROUP_RESIZING } from '../../constants';

/**
 * Draws a group at the size it was given by hand, or at its automatic size (#173).
 *
 * In em, as stored, so the size slider scales a resized group with everything else. The class
 * is what lifts the automatic 25em cap and makes the body scroll when the height is short.
 */
export function applyGroupSize(group: HTMLElement, size: GroupSize | null): void {
  group.classList.toggle(CLASS_GROUP_RESIZED, size !== null);
  group.style.width = size ? `${size.width}em` : '';
  group.style.height = size ? `${size.height}em` : '';
}

export interface ResizeCallbacks {
  /** The drag ended: keep this size. */
  resized(size: GroupSize): void;
  /** The corner was double-clicked: back to the automatic size. */
  reset(): void;
}

/**
 * The bottom-right corner of a group, dragged to resize it (#173).
 *
 * **Pointer events, not HTML5 drag and drop.** The group itself is draggable - that is how it
 * is reordered - so the group stops being draggable for as long as the corner is held, or the
 * browser would start carrying the whole column the moment the pointer moved. The pointer is
 * captured, so the drag keeps going wherever it wanders, the side panel included.
 *
 * The size is drawn on every move and stored once, when the corner is let go.
 */
export function attachResizeHandle(group: HTMLElement, callbacks: ResizeCallbacks): HTMLElement {
  const handle = document.createElement('div');
  handle.classList.add(CLASS_GROUP_RESIZE_HANDLE);
  handle.draggable = false;
  handle.setAttribute('aria-hidden', 'true');

  let start: { x: number; y: number; width: number; height: number; em: number } | null = null;
  let wasDraggable = false;
  let size: GroupSize | null = null;

  handle.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const box = group.getBoundingClientRect();
    start = {
      x: event.clientX, y: event.clientY, width: box.width, height: box.height,
      em: parseFloat(getComputedStyle(group).fontSize) || 16
    };
    size = null;
    wasDraggable = group.draggable;
    group.draggable = false;
    group.classList.add(CLASS_GROUP_RESIZING);
    handle.setPointerCapture?.(event.pointerId);
  });

  handle.addEventListener('pointermove', event => {
    if (!start) return;
    size = {
      width: Math.max(MIN_GROUP_WIDTH, (start.width + event.clientX - start.x) / start.em),
      height: Math.max(MIN_GROUP_HEIGHT, (start.height + event.clientY - start.y) / start.em)
    };
    applyGroupSize(group, size);
  });

  const finish = (event: PointerEvent): void => {
    if (!start) return;
    start = null;
    group.draggable = wasDraggable;
    group.classList.remove(CLASS_GROUP_RESIZING);
    handle.releasePointerCapture?.(event.pointerId);
    // A press that never moved is half of a double-click, not a resize.
    if (size) callbacks.resized(size);
  };
  handle.addEventListener('pointerup', finish);
  handle.addEventListener('pointercancel', finish);

  handle.addEventListener('click', event => event.stopPropagation());
  handle.addEventListener('dblclick', event => {
    event.stopPropagation();
    callbacks.reset();
  });

  group.appendChild(handle);
  return handle;
}
