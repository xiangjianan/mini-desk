import { h, type VNodeChild } from "vue";
import type { DropdownOption } from "naive-ui";

const CONTEXT_MENU_OPENED = "mini-desk-context-menu-opened";

/**
 * 右键菜单里需要加「彩色流动」效果的智能项：克隆星标重点提醒的渐变流动。
 * 智能粘贴/智能润色是两条 AI 润色主入口，用同样流动渐变突出，方便用户一眼识别。
 */
const POLISH_MENU_KEYS = new Set(["smart-paste", "smart-polish"]);

function resolveOptionLabel(label: DropdownOption["label"]): string {
  // label 被联合类型与索引签名拓宽成 unknown；调用方只用字符串标签，这里统一归一成 string。
  if (typeof label === "function") return String(label());
  return typeof label === "string" ? label : "";
}

/**
 * NDropdown 的 `render-label` 注入：命中智能粘贴/智能润色时，把标签文字包进
 * `.polish-menu-flow`（渐变 + 循环流动，与星标提醒一致）；其余菜单项原样渲染。
 * 供提示区与提醒区两个右键菜单共用，避免把渐变逻辑散落到各面板。
 */
export function renderPolishMenuLabel(option: DropdownOption): VNodeChild {
  const key = option?.key;
  if (typeof key === "string" && POLISH_MENU_KEYS.has(key)) {
    return h("span", { class: "polish-menu-flow" }, resolveOptionLabel(option.label));
  }
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
