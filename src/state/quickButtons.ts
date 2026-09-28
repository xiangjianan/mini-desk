import type { BoardState, QuickButton, QuickTag } from "../types";
import { matchesSearch } from "../utils/searchHighlight";
import { assignColumn, distributeColumns } from "./columns";

export interface QuickButtonGroup {
  id: string;
  title: string;
  buttons: QuickButton[];
  reorderable: boolean;
  collapsed: boolean;
  /** 0–100 使用热度染色强度（quickTagUsagePercent 数学折算）；其他/空态组不带。 */
  usagePercent?: number;
  /** Pinned masonry column (from the tag); undefined for the 其他/empty groups. */
  column?: number;
}

export const QUICK_BUTTON_EMPTY_GROUP_ID = "__empty";
export const QUICK_BUTTON_OTHER_GROUP_ID = "__other";
export const QUICK_DENSITY_THRESHOLD = 50;

/** 点击数封顶：达到该次数即染到最深（100%）。 */
export const QUICK_TAG_USAGE_MAX_CLICKS = 100;

/** 把标签点击数折算成 0–100 的染色百分比；非法输入按 0 处理。 */
export function quickTagUsagePercent(clicks: unknown): number {
  if (typeof clicks !== "number" || !Number.isFinite(clicks)) return 0;
  return Math.max(0, Math.min(QUICK_TAG_USAGE_MAX_CLICKS, Math.floor(clicks)));
}

/** 命中则该标签 clicks +1 并返回 true；tagId 缺失/失效（「其他」组）不计。 */
export function recordQuickTagClick(tags: QuickTag[], tagId: string | undefined): boolean {
  if (!tagId) return false;
  const tag = tags.find((item) => item.id === tagId);
  if (!tag) return false;
  tag.clicks = (tag.clicks ?? 0) + 1;
  return true;
}

/** 各工作区标签的现行使用计数快照（撤销恢复前捕获，恢复后回填）。 */
export function captureQuickTagClicks(state: BoardState): Record<string, Record<string, number>> {
  const captured: Record<string, Record<string, number>> = {};
  for (const workspace of state.workspaces) {
    for (const tag of workspace.quickTags) {
      if (tag.clicks === undefined) continue;
      (captured[workspace.id] ??= {})[tag.id] = tag.clicks;
    }
  }
  return captured;
}

/** 把捕获的计数回填到恢复后的状态：标签还在则覆盖，标签已被删除则丢弃。 */
export function restoreQuickTagClicks(state: BoardState, captured: Record<string, Record<string, number>>): void {
  for (const workspace of state.workspaces) {
    const tagClicks = captured[workspace.id];
    if (!tagClicks) continue;
    for (const tag of workspace.quickTags) {
      const clicks = tagClicks[tag.id];
      if (clicks !== undefined) tag.clicks = clicks;
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
  const otherButtons: QuickButton[] = [];

  for (const button of buttons) {
    if (!showHidden && button.hidden) continue;
    const group = button.tagId ? taggedButtons.get(button.tagId) : undefined;
    if (group) group.push(button);
    else otherButtons.push(button);
  }

  const groups = tags.flatMap((tag): QuickButtonGroup[] => {
    const groupButtons = taggedButtons.get(tag.id) ?? [];
    if (groupButtons.length === 0) return [];
    return [{
      id: tag.id,
      title: tag.title,
      buttons: groupButtons,
      reorderable: true,
      collapsed: Boolean(tag.collapsed),
      usagePercent: quickTagUsagePercent(tag.clicks),
      column: tag.column ?? 0,
    }];
  });

  if (otherButtons.length > 0) {
    groups.push({
      id: QUICK_BUTTON_OTHER_GROUP_ID,
      title: otherTitle,
      buttons: otherButtons,
      reorderable: false,
      collapsed: otherCollapsed,
    });
  }

  return groups.length > 0
    ? groups
    : [{ id: QUICK_BUTTON_EMPTY_GROUP_ID, title: "", buttons: [], reorderable: false, collapsed: false }];
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
  if (width < QUICK_MULTI_COLUMN_THRESHOLD || groupCount <= 1) return 1;
  const computed = 2 + Math.floor((width - QUICK_MULTI_COLUMN_THRESHOLD) / QUICK_COLUMN_TARGET_WIDTH);
  return Math.max(1, Math.min(computed, groupCount));
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
