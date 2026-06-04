const CONTEXT_MENU_OPENED = "mini-desk-context-menu-opened";

export const CONTEXT_MENU_Z_INDEX = 3400;

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
