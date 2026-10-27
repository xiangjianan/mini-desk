import type { BoardState, QuickButton, QuickTag, WorkspaceData } from "../types";
import { matchesSearch } from "../utils/searchHighlight";
import { assignColumn, distributeColumns, computePanelColumnCount } from "./columns";

/** Place relative to a target after removing the source, avoiding downward index drift. */
export function reorderQuickButton(items: QuickButton[], sourceId: string, targetId: string, insertBefore: boolean): void {
  if (sourceId === targetId) return;
  const sourceIndex = items.findIndex(item => item.id === sourceId);
  if (sourceIndex < 0 || !items.some(item => item.id === targetId)) return;
  const [source] = items.splice(sourceIndex, 1);
  const targetIndex = items.findIndex(item => item.id === targetId);
  items.splice(targetIndex + (insertBefore ? 0 : 1), 0, source);
}

export interface QuickButtonGroup {
  id: string;
  title: string;
  buttons: QuickButton[];
  reorderable: boolean;
  collapsed: boolean;
  /** Pinned masonry column (from the tag); undefined for the 其他/empty groups. */
  column?: number;
}

export const QUICK_BUTTON_EMPTY_GROUP_ID = "__empty";
export const QUICK_BUTTON_OTHER_GROUP_ID = "__other";
export const QUICK_DENSITY_THRESHOLD = 12;

export function toggleQuickHiddenVisibility(workspace: Pick<WorkspaceData, "quickTags" | "showHiddenQuickButtons">, tagId?: string): void {
  if (tagId) {
    const tag = workspace.quickTags.find(tag => tag.id === tagId);
    if (tag) tag.showHidden = !(tag.showHidden ?? workspace.showHiddenQuickButtons);
    return;
  }
  workspace.showHiddenQuickButtons = !workspace.showHiddenQuickButtons;
  for (const tag of workspace.quickTags) delete tag.showHidden;
}

/** 显示真实累计次数；旧数据中的无效值按零处理。 */
export function quickButtonClickCount(clicks: unknown): number {
  return typeof clicks === "number" && Number.isFinite(clicks) ? Math.max(0, Math.floor(clicks)) : 0;
}

/** 该快捷按钮使用计数 +1（按钮级：点谁计谁，未分组按钮同样计数）。 */
export function recordQuickButtonClick(button: QuickButton): void {
  button.clicks = (button.clicks ?? 0) + 1;
}

/** 各工作区按钮的现行使用计数快照（撤销恢复前捕获，恢复后回填）。 */
export function captureQuickButtonClicks(state: BoardState): Record<string, Record<string, number>> {
  const captured: Record<string, Record<string, number>> = {};
  for (const workspace of state.workspaces) {
    for (const button of workspace.quickButtons) {
      if (button.clicks === undefined) continue;
      (captured[workspace.id] ??= {})[button.id] = button.clicks;
    }
  }
  return captured;
}

/** 把捕获的计数回填到恢复后的状态：按钮还在则覆盖，按钮已删除则丢弃。 */
export function restoreQuickButtonClicks(state: BoardState, captured: Record<string, Record<string, number>>): void {
  for (const workspace of state.workspaces) {
    const buttonClicks = captured[workspace.id];
    if (!buttonClicks) continue;
    for (const button of workspace.quickButtons) {
      const clicks = buttonClicks[button.id];
      if (clicks !== undefined) button.clicks = clicks;
    }
  }
}

export function buildVisibleQuickButtonGroups(
  buttons: QuickButton[],
  tags: QuickTag[],
  showHidden: boolean,
  otherTitle: string,
  otherCollapsed = false,
): QuickButtonGroup[] {
  const taggedButtons = new Map(tags.map((tag) => [tag.id, [] as QuickButton[]]));
  const visibility = new Map(tags.map(tag => [tag.id, tag.showHidden ?? showHidden]));
  const otherButtons: QuickButton[] = [];

  for (const button of buttons) {
    if (button.hidden && !(button.tagId ? visibility.get(button.tagId) ?? showHidden : showHidden)) continue;
    const group = button.tagId ? taggedButtons.get(button.tagId) : undefined;
    if (group) group.push(button);
    else otherButtons.push(button);
  }

  const groups = tags.flatMap((tag): QuickButtonGroup[] => {
    const groupButtons = taggedButtons.get(tag.id) ?? [];
    return [{
      id: tag.id,
      title: tag.title,
      buttons: groupButtons,
      reorderable: true,
      collapsed: Boolean(tag.collapsed),
      column: tag.column ?? 0,
    }];
  });

  if (otherButtons.length > 0 || groups.length === 0) {
    groups.push({
      id: QUICK_BUTTON_OTHER_GROUP_ID,
      title: otherTitle,
      buttons: otherButtons,
      reorderable: false,
      collapsed: otherButtons.length > 0 && otherCollapsed,
    });
  }

  return groups;
}

export function hasOverloadedVisibleQuickButtonGroup(
  buttons: QuickButton[],
  tags: QuickTag[],
  threshold: number,
): boolean {
  const tagIds = new Set(tags.map((tag) => tag.id));
  const counts = new Map<string, number>();

  for (const button of buttons) {
    if (button.hidden) continue;
    const groupId = button.tagId && tagIds.has(button.tagId) ? button.tagId : QUICK_BUTTON_OTHER_GROUP_ID;
    const count = (counts.get(groupId) ?? 0) + 1;
    if (count > threshold) return true;
    counts.set(groupId, count);
  }

  return false;
}

/** Width below which the quick panel stays single-column (= 2 × the target column width). */
export const QUICK_MULTI_COLUMN_THRESHOLD = 640;
export const QUICK_COLUMN_TARGET_WIDTH = 320;

/**
 * Map a measured quick-panel content width to a column count: 1 below the
 * threshold, then +1 column per additional QUICK_COLUMN_TARGET_WIDTH, clamped
 * to the visible group count (so few groups never leave empty columns).
 */
export function computeQuickColumnCount(width: number, groupCount: number): number {
  return computePanelColumnCount(width, groupCount, QUICK_MULTI_COLUMN_THRESHOLD, QUICK_COLUMN_TARGET_WIDTH);
}

/**
 * Group visible quick-button groups into explicit column buckets by their
 * pinned `column`, clamped to `columnCount`. Array order within a bucket =
 * vertical order. Non-tag groups (其他/空态) carry no `column` and always land
 * at the end of the LAST bucket — the 其他 group is not reorderable and stays
 * after every tag, mirroring its single-column position.
 */
export function groupQuickButtonsByColumn(groups: QuickButtonGroup[], columnCount: number): QuickButtonGroup[][] {
  const columns = Math.max(1, columnCount);
  const buckets: QuickButtonGroup[][] = Array.from({ length: columns }, () => []);
  const clamp = (column: number): number => Math.max(0, Math.min(column, columns - 1));
  groups.forEach((group) => {
    buckets[group.column === undefined ? columns - 1 : clamp(group.column)].push(group);
  });
  return buckets;
}

/** Auto-distribute quick tags across columns (see [columns.ts](./columns.ts)). */
export function distributeQuickTagColumns(tags: QuickTag[], columnCount: number): QuickTag[] {
  return distributeColumns(tags, columnCount);
}

/** Move a dragged quick tag into a column relative to an anchor tag (see [columns.ts](./columns.ts)). */
export function assignQuickTagColumn(
  tags: QuickTag[],
  draggedId: string,
  targetColumn: number,
  anchorId: string | null,
  insertBefore: boolean,
): QuickTag[] {
  return assignColumn(tags, draggedId, targetColumn, anchorId, insertBefore);
}

const QUICK_COPY_PREVIEW_MAX_LENGTH = 120;

/** Collapse whitespace and cap length for showing copied text inside a bubble. */
export function formatQuickCopiedPreview(value: string, maxLength = QUICK_COPY_PREVIEW_MAX_LENGTH): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (collapsed.length <= maxLength) return collapsed;
  return `${collapsed.slice(0, maxLength)}…`;
}

export function filterVisibleQuickButtonGroups(
  groups: QuickButtonGroup[],
  normalized: string,
): QuickButtonGroup[] {
  if (!normalized) return groups;
  return groups
    .map((group): QuickButtonGroup | null => {
      if (matchesSearch(group.title, normalized)) {
        return group.collapsed ? { ...group, collapsed: false } : group;
      }
      const matchedButtons = group.buttons.filter(
        (button) => matchesSearch(button.title, normalized) || matchesSearch(button.value, normalized),
      );
      if (matchedButtons.length === 0) return null;
      return { ...group, buttons: matchedButtons, collapsed: false };
    })
    .filter((group): group is QuickButtonGroup => group !== null);
}
