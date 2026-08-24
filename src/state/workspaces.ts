import { DEFAULT_BOARD_TITLE, defaultWorkspace } from "./defaults";
import { createId } from "./storage";
import type { LineItem, WorkspaceData, WorkspaceSpace } from "../types";

/** 工作空间看板标题：自定义标题去空白后为空时回退默认看板标题（DEFAULT_BOARD_TITLE）。 */
export function getWorkspaceBoardTitle(workspace: WorkspaceData): string {
  return workspace.customTitles["board-title"]?.trim() || DEFAULT_BOARD_TITLE;
}

export function buildWorkspaceCustomTitles(title: string, slogan: string): Record<string, string> {
  const titles: Record<string, string> = {};
  const trimmedTitle = title.trim();
  const trimmedSlogan = slogan.trim();
  if (trimmedTitle) titles["board-title"] = trimmedTitle;
  if (trimmedSlogan) titles["board-slogan"] = trimmedSlogan;
  return titles;
}

export function createWorkspaceData(
  title: string,
  slogan: string,
  createdAt: number,
  id: string = createId(),
): WorkspaceData {
  return {
    ...defaultWorkspace(id),
    createdAt,
    customTitles: buildWorkspaceCustomTitles(title, slogan),
  };
}

export function ensureUniqueWorkspaceTitle(workspace: WorkspaceData, existing: WorkspaceData[], fallbackTitle = ""): WorkspaceData {
  const fallback = fallbackTitle.trim();
  const title = workspace.customTitles["board-title"]?.trim() || fallback;
  if (!title) return workspace;
  const taken = new Set(
    existing
      .filter((item) => item.id !== workspace.id)
      .map((item) => item.customTitles["board-title"]?.trim() || fallback)
      .filter((value): value is string => Boolean(value)),
  );
  if (!taken.has(title)) return workspace;
  let index = 2;
  while (taken.has(`${title} ${index}`)) index += 1;
  return {
    ...workspace,
    customTitles: { ...workspace.customTitles, "board-title": `${title} ${index}` },
  };
}

export function removeWorkspace(
  workspaces: WorkspaceData[],
  activeWorkspaceId: string,
  id: string,
): { workspaces: WorkspaceData[]; activeWorkspaceId: string } {
  if (workspaces.length <= 1) return { workspaces, activeWorkspaceId };
  const index = workspaces.findIndex((workspace) => workspace.id === id);
  if (index < 0) return { workspaces, activeWorkspaceId };
  const nextWorkspaces = workspaces.filter((workspace) => workspace.id !== id);
  const nextActive = id === activeWorkspaceId
    ? (nextWorkspaces[Math.max(0, index - 1)]?.id ?? nextWorkspaces[0].id)
    : activeWorkspaceId;
  return { workspaces: nextWorkspaces, activeWorkspaceId: nextActive };
}

export function reorderWorkspaces(workspaces: WorkspaceData[], dragId: string, targetId: string): WorkspaceData[] {
  const sourceIndex = workspaces.findIndex((workspace) => workspace.id === dragId);
  const targetIndex = workspaces.findIndex((workspace) => workspace.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return workspaces;
  const next = [...workspaces];
  const [item] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, item);
  return next;
}

/** 兼容投影：workspaceLines/storageLines 恒等于 spaces[0]/spaces[1] 的逐行浅拷贝（App.vue 与 sync/pull.ts 共用此不变量）。 */
export function projectLegacySpaceLines(spaces: WorkspaceSpace[]): { workspaceLines: LineItem[]; storageLines: LineItem[] } {
  return {
    workspaceLines: spaces[0]?.lines.map((line) => ({ ...line })) ?? [],
    storageLines: spaces[1]?.lines.map((line) => ({ ...line })) ?? [],
  };
}
