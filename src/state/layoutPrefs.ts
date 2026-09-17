/**
 * 工作台四区宽度偏好：按工作区独立存 localStorage。
 * WorkbenchShell 读写（无工作区上下文时回落共享键）；App 在删除工作区时
 * 调 removeWorkbenchWidths 清掉该空间独占的键。
 */
export const WORKBENCH_WIDTH_STORAGE_KEY = "mini-desk-workbench-widths";
export const LEGACY_WORKBENCH_WIDTH_STORAGE_KEY = "todo-board-workbench-widths";

/** 某个工作区独占的存储键；workspaceId 为空时回落旧的共享键。 */
export function workbenchWidthStorageKey(workspaceId: string): string {
  return workspaceId ? `${WORKBENCH_WIDTH_STORAGE_KEY}:${workspaceId}` : WORKBENCH_WIDTH_STORAGE_KEY;
}

/** 删除工作区时清掉它独占的区域宽度存储；旧共享键不动（其余空间仍以其为初始种子）。 */
export function removeWorkbenchWidths(workspaceId: string): void {
  if (!workspaceId) return;
  try {
    localStorage.removeItem(`${WORKBENCH_WIDTH_STORAGE_KEY}:${workspaceId}`);
  } catch {
    // Storage may be unavailable in restricted contexts; cleanup is best-effort.
  }
}
