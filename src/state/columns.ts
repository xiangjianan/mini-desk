export const TODO_COLUMN_LIMIT_OPTIONS = [1, 2, 3, 4, 5, 6] as const;

/** Missing/invalid legacy settings retain the default single-column layout. */
export function normalizeTodoMaxColumns(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 6 ? value : 1;
}

/**
 * Masonry-column layout shared by the todo list panel and the quick-tag panel.
 * Both pin each item to an explicit `column` index (0-based, clamped to the
 * current column count at display time); array order is the vertical order
 * within a column.
 */
export interface ColumnItem {
  id: string;
  column?: number;
}

/**
 * Auto-distribute items across `columnCount` columns, column-major (fills
 * column 0 top-to-bottom, then column 1, …) with a left-biased balance: every
 * column gets `floor(N / C)` items, and the first `N mod C` columns get one
 * extra. This guarantees a column is never shorter than the one to its right
 * (the left column always stays "ahead") and never leaves a trailing column
 * empty. Runs only while the layout is not yet manual. Each item's `column` is
 * overwritten; array order is preserved.
 */
export function distributeColumns<T extends ColumnItem>(items: T[], columnCount: number): T[] {
  const columns = Math.max(1, Math.floor(columnCount));
  if (columns === 1) {
    return items.map((item) => (item.column === 0 ? item : { ...item, column: 0 }));
  }
  const base = Math.floor(items.length / columns);
  const remainder = items.length % columns;
  // Map each item index to its column by walking the per-column sizes left to
  // right. Column c holds `base + 1` items while c < remainder, else `base`.
  const columnOfIndex = new Array<number>(items.length);
  let cursor = 0;
  for (let column = 0; column < columns; column += 1) {
    const size = base + (column < remainder ? 1 : 0);
    for (let offset = 0; offset < size; offset += 1) {
      columnOfIndex[cursor] = column;
      cursor += 1;
    }
  }
  return items.map((item, index) => {
    const column = columnOfIndex[index] ?? columns - 1;
    return item.column === column ? item : { ...item, column };
  });
}

/**
 * Move the dragged item into `targetColumn`, positioned relative to an anchor
 * item (which must already be in that column). Used for both dropping onto an
 * item (`insertBefore` controls before/after the anchor) and dropping into a
 * column's blank space (`anchorId === null` → appended after the last item
 * currently in `targetColumn`). Always updates the dragged item's `column`.
 * No-op when the dragged item is missing or the target column is negative.
 */
export function assignColumn<T extends ColumnItem>(
  items: T[],
  draggedId: string,
  targetColumn: number,
  anchorId: string | null,
  insertBefore: boolean,
): T[] {
  const sourceIndex = items.findIndex((item) => item.id === draggedId);
  if (sourceIndex < 0 || targetColumn < 0) return items;
  const column = Math.floor(targetColumn);
  const next = items.map((item) => ({ ...item }));
  const [dragged] = next.splice(sourceIndex, 1);
  const moved = dragged.column === column ? dragged : { ...dragged, column };
  let insertIndex: number;
  if (anchorId !== null && anchorId !== draggedId) {
    const anchorIndex = next.findIndex((item) => item.id === anchorId);
    insertIndex = anchorIndex >= 0 ? (insertBefore ? anchorIndex : anchorIndex + 1) : next.length;
  } else {
    // Blank space: land at the end of targetColumn's current items.
    let lastInColumn = -1;
    next.forEach((item, index) => {
      if (item.column === column) lastInColumn = index;
    });
    insertIndex = lastInColumn + 1;
  }
  next.splice(insertIndex, 0, moved);
  return next;
}

/** Persist only valid per-count layouts, discarding deleted/duplicate IDs. */
export function normalizeTodoColumnLayouts(value: unknown, items: ColumnItem[]): Record<string, { id: string; column: number }[]> {
  const result: Record<string, { id: string; column: number }[]> = {};
  if (!value || typeof value !== "object") return result;
  const ids = new Set(items.map((item) => item.id));
  for (const [key, entries] of Object.entries(value)) {
    const count = Number(key);
    if (!Number.isInteger(count) || count < 1 || count > 6 || !Array.isArray(entries)) continue;
    const seen = new Set<string>();
    result[String(count)] = entries.flatMap((entry) => {
      if (!entry || typeof entry.id !== "string" || !ids.has(entry.id) || seen.has(entry.id)) return [];
      seen.add(entry.id);
      const column = Number.isInteger(entry.column) ? Math.max(0, Math.min(count - 1, entry.column)) : 0;
      return [{ id: entry.id, column }];
    });
  }
  return result;
}

/** Restore a manual layout for this count, otherwise balance the canonical order. */
export function resolveTodoColumns<T extends ColumnItem>(items: T[], count: number, order: string[] = [], layouts: Record<string, { id: string; column: number }[]> = {}): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const saved = layouts[String(count)];
  const entries = saved ?? order.map((id) => ({ id, column: 0 }));
  const used = new Set<string>();
  const next: T[] = [];
  for (const entry of entries) {
    const item = byId.get(entry.id);
    if (!item || used.has(entry.id)) continue;
    used.add(entry.id);
    next.push(saved && item.column !== entry.column ? { ...item, column: entry.column } : item);
  }
  // New IDs may be absent from a saved layout. Once placed, keep their object
  // identity so a reactive layout restore converges instead of replacing forever.
  for (const item of items) if (!used.has(item.id)) {
    next.push(saved && item.column !== count - 1 ? { ...item, column: count - 1 } : item);
  }
  return saved ? next : distributeColumns(next, count);
}

/** Shared width-to-column calculation; each panel keeps its own sizing policy. */
export function computePanelColumnCount(width: number, itemCount: number, threshold: number, targetWidth: number): number {
  if (width < threshold || itemCount <= 1) return 1;
  const count = 2 + Math.floor((width - threshold) / targetWidth);
  return Math.max(1, Math.min(count, itemCount));
}
