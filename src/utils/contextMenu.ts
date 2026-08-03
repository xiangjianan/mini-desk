const CONTEXT_MENU_OPENED = "mini-desk-context-menu-opened";

/**
 * z-index for transient overlays (context menus, dropdowns, confirm bubbles).
 * This MUST sit above the modal layer (10000, see styles.css
 * `.n-modal-container`/`.n-modal-body-wrapper`) so overlays opened from within a
 * modal — right-clicking an image inside the preview, the quick-action menu, or
 * the companion confirm bubble shown over a workspace/tag dialog — are never
 * trapped behind the modal's full-screen frosted mask.
 */
export const CONTEXT_MENU_Z_INDEX = 10100;

let nextContextMenuId = 0;

type ContextMenuOpenOptions = {
  replacingExistingMenu?: boolean;
};

export function createExclusiveContextMenu(close: () => void): {
  handleClickOutside: (event?: Event) => void;
  notifyOpen: (event?: Event, options?: ContextMenuOpenOptions) => void;
  mount: () => void;
  unmount: () => void;
} {
  const id = nextContextMenuId;
  nextContextMenuId += 1;
  let lastOpenEventTime = Number.NEGATIVE_INFINITY;
  let suppressNextClickOutside = false;

  function handleOpened(event: Event): void {
    if ((event as CustomEvent<number>).detail !== id) close();
  }

  return {
    handleClickOutside(event?: Event): void {
      if (suppressNextClickOutside) {
        suppressNextClickOutside = false;
        return;
      }
      if (typeof event?.timeStamp === "number" && event.timeStamp <= lastOpenEventTime) return;
      close();
    },
    notifyOpen(event?: Event, options?: ContextMenuOpenOptions): void {
      lastOpenEventTime = typeof event?.timeStamp === "number" ? event.timeStamp : Number.NEGATIVE_INFINITY;
      suppressNextClickOutside = Boolean(options?.replacingExistingMenu);
      window.dispatchEvent(new CustomEvent(CONTEXT_MENU_OPENED, { detail: id }));
    },
    mount(): void {
      window.addEventListener(CONTEXT_MENU_OPENED, handleOpened);
    },
    unmount(): void {
      window.removeEventListener(CONTEXT_MENU_OPENED, handleOpened);
    },
  };
}
