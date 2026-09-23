import type { MarkColor, MarkType, TextMark } from "../types";
import { isPlainObject } from "../state/storage/shared";

export const MARK_TYPES: readonly MarkType[] = ["highlight", "strike", "underline", "color"];
export const MARK_COLORS: readonly MarkColor[] = ["amber", "rose", "green", "blue", "violet"];

function isColoredType(type: MarkType): boolean {
  return type === "highlight" || type === "color";
}

function sameMarkKind(mark: TextMark, type?: MarkType, color?: MarkColor): boolean {
  if (type !== undefined && mark.type !== type) return false;
  if (type === undefined || color === undefined) return true;
  return isColoredType(type) ? mark.color === color : true;
}

/** 排序（按 start）并合并相邻/重叠的同款（type+color）段。 */
export function mergeMarkList(marks: TextMark[]): TextMark[] {
  const sorted = [...marks].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: TextMark[] = [];
  for (const mark of sorted) {
    const last = merged[merged.length - 1];
    if (last && last.type === mark.type && last.color === mark.color && mark.start <= last.end) {
      merged[merged.length - 1] = { ...last, end: Math.max(last.end, mark.end) };
      continue;
    }
    merged.push({ ...mark });
  }
  return merged;
}

/** 存储入口的写屏障：校验、clamp、丢非法、剥多余 color，最后排序合并。 */
export function normalizeMarkList(value: unknown, textLength: number): TextMark[] {
  if (!Array.isArray(value)) return [];
  const marks: TextMark[] = [];
  for (const item of value) {
    if (!isPlainObject(item)) continue;
    const record = item as Record<string, unknown>;
    const type = record.type;
    if (typeof type !== "string" || !(MARK_TYPES as readonly string[]).includes(type)) continue;
    const start = record.start;
    const end = record.end;
    if (typeof start !== "number" || !Number.isInteger(start)) continue;
    if (typeof end !== "number" || !Number.isInteger(end)) continue;
    const colored = isColoredType(type as MarkType);
    const color = record.color;
    if (colored && (typeof color !== "string" || !(MARK_COLORS as readonly string[]).includes(color))) continue;
    const clampedStart = Math.max(0, Math.min(start, textLength));
    const clampedEnd = Math.max(0, Math.min(end, textLength));
    if (clampedStart >= clampedEnd) continue;
    marks.push(colored
      ? { type: type as MarkType, start: clampedStart, end: clampedEnd, color: color as MarkColor }
      : { type: type as MarkType, start: clampedStart, end: clampedEnd });
  }
  return mergeMarkList(marks);
}

interface LineEdit {
  start: number;
  removed: number;
  added: number;
}

function getCommonPrefixLength(left: string, right: string): number {
  const max = Math.min(left.length, right.length);
  let index = 0;
  while (index < max && left[index] === right[index]) index += 1;
  return index;
}

function getCommonSuffixLength(left: string, right: string): number {
  const max = Math.min(left.length, right.length);
  let count = 0;
  while (count < max && left[left.length - 1 - count] === right[right.length - 1 - count]) count += 1;
  return count;
}

/** 单行内的等价改写区间：公共前缀 + 公共后缀夹出中间的删除/插入。 */
function getInLineEdit(lineBefore: string, lineAfter: string): LineEdit {
  const start = getCommonPrefixLength(lineBefore, lineAfter);
  const suffix = getCommonSuffixLength(lineBefore.slice(start), lineAfter.slice(start));
  return { start, removed: lineBefore.length - start - suffix, added: lineAfter.length - start - suffix };
}

/**
 * 旧偏移映射到新偏移：编辑区内吸附到插入段末尾，编辑区后平移 delta。
 * 边界约定：偏移恰落在纯插入点上时，mark 的 start 端被插入文本推到右边
 * （插入的文字不进高亮），end 端保持不动（插在 mark 之后的文字不影响它）。
 */
function mapOffsetThroughEdit(offset: number, edit: LineEdit, insertionGoesBefore: boolean): number {
  if (offset < edit.start) return offset;
  if (offset === edit.start && edit.removed === 0) {
    return insertionGoesBefore ? offset + edit.added : offset;
  }
  if (offset >= edit.start + edit.removed) return offset + edit.added - edit.removed;
  return edit.start + edit.added;
}

function translateRangeThroughEdit(mark: TextMark, edit: LineEdit): TextMark | null {
  const start = mapOffsetThroughEdit(mark.start, edit, true);
  const end = mapOffsetThroughEdit(mark.end, edit, false);
  if (start >= end) return null;
  return { ...mark, start, end };
}

function getLineStarts(lines: string[]): number[] {
  const starts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    starts.push(offset);
    offset += line.length + 1;
  }
  return starts;
}

function findLineForOffset(lineStarts: number[], offset: number): number {
  let index = 0;
  while (index + 1 < lineStarts.length && lineStarts[index + 1] <= offset) index += 1;
  return index;
}

/**
 * 文本变更后的 marks 平移器。行级公共前缀/后缀对齐，中段旧行按位置配对（等行数时
 * 逐行等价改写——重编号级联改写多行也走这里），行内再用前后缀 diff 夹出编辑区。
 * 打字、粘贴、IME、AI 润色替换、撤销、自动重编号全部走这同一个通道，无特判。
 */
export function translateMarksForEdit(marks: TextMark[], previous: string, next: string): TextMark[] {
  if (previous === next || marks.length === 0) return marks;
  const before = previous.split("\n");
  const after = next.split("\n");
  let head = 0;
  const headMax = Math.min(before.length, after.length);
  while (head < headMax && before[head] === after[head]) head += 1;
  let tail = 0;
  const tailMax = Math.min(before.length - head, after.length - head);
  while (tail < tailMax && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail += 1;
  const replacedStart = head;
  const replacedEnd = before.length - tail;
  const pairedCount = Math.min(replacedEnd - replacedStart, after.length - tail - head);
  const totalDelta = next.length - previous.length;
  const beforeStarts = getLineStarts(before);
  const afterStarts = getLineStarts(after);

  const result: TextMark[] = [];
  for (const mark of marks) {
    const line = findLineForOffset(beforeStarts, mark.start);
    if (line < replacedStart) {
      result.push(mark);
      continue;
    }
    if (line >= replacedEnd) {
      result.push({ ...mark, start: mark.start + totalDelta, end: mark.end + totalDelta });
      continue;
    }
    const pairedIndex = line - replacedStart;
    if (pairedIndex >= pairedCount) continue; // 行被删除，mark 随之消失
    const edit = getInLineEdit(before[line] ?? "", after[replacedStart + pairedIndex] ?? "");
    if (edit.removed === 0 && edit.added === 0) {
      result.push(mark);
      continue;
    }
    const baseBefore = beforeStarts[line] ?? 0;
    const baseAfter = afterStarts[replacedStart + pairedIndex] ?? 0;
    const local: TextMark = { ...mark, start: mark.start - baseBefore, end: mark.end - baseBefore };
    const translated = translateRangeThroughEdit(local, edit);
    if (translated) result.push({ ...translated, start: translated.start + baseAfter, end: translated.end + baseAfter });
  }
  return result;
}
