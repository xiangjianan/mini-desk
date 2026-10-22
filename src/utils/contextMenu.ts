import { type VNodeChild } from "vue";
import type { DropdownOption } from "naive-ui";

const CONTEXT_MENU_OPENED = "mini-desk-context-menu-opened";

function resolveOptionLabel(label: DropdownOption["label"]): string {
  // label 被联合类型与索引签名拓宽成 unknown；调用方只用字符串标签，这里统一归一成 string。
  if (typeof label === "function") return String(label());
  return typeof label === "string" ? label : "";
}

export function renderContextMenuLabel(option: DropdownOption): VNodeChild {
  return resolveOptionLabel(option.label);
}

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

/** Consistent sections for context menus; keys still route to each panel's actions. */
export function organizeContextMenu(options: DropdownOption[]): DropdownOption[] {
  const group = (option: DropdownOption): number => {
    const key = String(option.key ?? "");
    if (["guide", "tips"].includes(key)) return 5;
    if (key.startsWith("delete") || key === "clear-completed") return 4;
    if (key.startsWith("move") || key.startsWith("pin-")) return 3;
    if (["export", "copy", "copy-text", "copy-link", "paste", "preview", "close-preview", "add", "create", "create-list"].includes(key)) return 0;
    return 1;
  };
  const sorted = options.filter((option) => option.type !== "divider")
    .map((option, index) => ({ option, index, group: group(option) }))
    .sort((a, b) => a.group - b.group || a.index - b.index);
  const result: DropdownOption[] = [];
  sorted.forEach((entry, index) => {
    if (index > 0 && entry.group !== sorted[index - 1].group) {
      result.push({ type: "divider", key: `context-section-${entry.group}` });
    }
    result.push(entry.option);
  });
  return result;
}
