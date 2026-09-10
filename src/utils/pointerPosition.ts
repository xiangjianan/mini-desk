/**
 * 全局指针位置追踪：记录最近一次鼠标/触摸交互的视口坐标。
 * 二次确认弹框用它把弹框落到「鼠标右上方」，而无需在各触发点透传 MouseEvent。
 */

let lastPointer: { x: number; y: number } | null = null;
let tracking = false;

function recordPointer(event: MouseEvent): void {
  lastPointer = { x: event.clientX, y: event.clientY };
}

/** 幂等启动追踪：捕获阶段监听，避免被业务层的 stopPropagation 拦掉。 */
export function startPointerTracking(): void {
  if (tracking || typeof window === "undefined") return;
  tracking = true;
  // mousemove 维持「鼠标当前在哪」，click/contextmenu/pointerdown 覆盖触屏与菜单选择。
  for (const type of ["mousemove", "click", "contextmenu", "pointerdown"] as const) {
    window.addEventListener(type, recordPointer, { capture: true, passive: true });
  }
}

/** 最近一次指针位置；从未记录过（如纯键盘操作的新页面）返回 null。 */
export function getLastPointerPosition(): { x: number; y: number } | null {
  return lastPointer;
}

/** 测试隔离：清空已记录的指针位置。 */
export function resetLastPointerPosition(): void {
  lastPointer = null;
}
