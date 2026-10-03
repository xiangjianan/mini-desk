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

/** 行相似度：公共前缀 + 公共后缀长度。重编号只改写行首标记，改写前后高度相似；
 *  行相等锚不住时用相似度选缺口位置。 */
function lineSimilarity(left: string, right: string): number {
  const prefix = getCommonPrefixLength(left, right);
  return prefix + getCommonSuffixLength(left.slice(prefix), right.slice(prefix));
}

/**
 * 行数不等的区段对齐。删除侧（旧行多，delta>0）：单次拼接编辑删除的是一段连续行，
 * 枚举缺口位置 k（前 k 行 1:1 配对、跳过 delta 行、其余继续 1:1），取配对行相似度
 * 总和最大者——纯位置配对会把「被删空行 + 重编号改写」误判成「高亮行本身被删」，
 * 高亮随行消失。平分时保持缺口在末尾（= 旧位置配对）。
 * 插入侧（delta<0）与等行数保持纯位置配对：Enter 断行的「前半段保留、移下去的
 * 后半段裁剪」语义由此钉死（text-marks 测试），相似度配对无法区分断行与行首插行。
 * 返回旧区行号 → 新区行号的映射；缺口内的旧行映射 null（行被删除）。
 */
function buildRegionPairing(
  beforeRegion: string[],
  afterRegion: string[],
): (oldIndex: number) => number | null {
  const delta = beforeRegion.length - afterRegion.length;
  const pairCount = Math.min(beforeRegion.length, afterRegion.length);
  if (delta <= 0) return (oldIndex) => (oldIndex < pairCount ? oldIndex : null);
  // k=pairCount（缺口在末尾）先作基线，其余 k 需严格更优才接管——平局时回归旧行为。
  let bestK = pairCount;
  let bestScore = regionPairingScore(beforeRegion, afterRegion, delta, pairCount);
  for (let k = 0; k < pairCount; k += 1) {
    const score = regionPairingScore(beforeRegion, afterRegion, delta, k);
    if (score > bestScore) {
      bestScore = score;
      bestK = k;
    }
  }
  return (oldIndex) => {
    if (oldIndex < bestK) return oldIndex;
    if (oldIndex < bestK + delta) return null;
    return oldIndex - delta;
  };
}

/** 缺口位置 k 的配对总分：前 k 对位置配对，其后长侧跳过 delta 行再继续配对。 */
function regionPairingScore(beforeRegion: string[], afterRegion: string[], delta: number, k: number): number {
  let score = 0;
  for (let index = 0; index < k; index += 1) {
    score += lineSimilarity(beforeRegion[index] ?? "", afterRegion[index] ?? "");
  }
  for (let index = k; index < Math.min(beforeRegion.length, afterRegion.length); index += 1) {
    score += lineSimilarity(beforeRegion[index + delta] ?? "", afterRegion[index] ?? "");
  }
  return score;
}

/**
 * 文本变更后的 marks 平移器。行级公共前缀/后缀对齐夹出变化区段；区段内等行数时
 * 逐行等价改写（重编号级联改写多行也走这里），行数不等时按连续缺口对齐（见
 * buildRegionPairing），行内再用前后缀 diff 夹出编辑区。打字、粘贴、IME、AI 润色
 * 替换、撤销、自动重编号全部走这同一个通道，无特判。
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
  const pairInRegion = buildRegionPairing(
    before.slice(replacedStart, replacedEnd),
    after.slice(head, after.length - tail),
  );
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
    const pairedIndex = pairInRegion(line - replacedStart);
    if (pairedIndex === null) continue; // 行被删除，mark 随之消失
    const edit = getInLineEdit(before[line] ?? "", after[head + pairedIndex] ?? "");
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

/**
 * 行首缩进长度（\t 或连续 4 空格组）。口径与 textEditor.ts 的 getIndentInfo 一致：
 * marks 相对缩进后的行文本，缩进位不承载 mark，往返存储时会被钳到内容起点。
 */
function getLeadingIndentLength(text: string, lineStart: number): number {
  let index = lineStart;
  while (index < text.length) {
    if (text[index] === "\t") {
      index += 1;
      continue;
    }
    if (text.slice(index, index + 4) === "    ") {
      index += 4;
      continue;
    }
    break;
  }
  return index - lineStart;
}

/**
 * 覆盖判定的缺口豁免：换行符与行首缩进位不算未覆盖——它们在存储模型中不承载
 * mark（行文本不含缩进），从行首开始选多行的选区因此仍可判定为「已完整覆盖」。
 */
function isGapExempt(text: string, from: number, to: number): boolean {
  for (let index = from; index < to; index += 1) {
    const ch = text[index];
    if (ch === "\n") continue;
    if (ch === " " || ch === "\t") {
      const lineStart = text.lastIndexOf("\n", index - 1) + 1;
      if (index - lineStart < getLeadingIndentLength(text, lineStart)) continue;
    }
    return false;
  }
  return true;
}

/** 选区（跨行时换行符与行首缩进位豁免）是否每一段都被同款 mark 完整覆盖。 */
function isRangeFullyMarked(
  text: string,
  marks: TextMark[],
  range: { start: number; end: number },
  type: MarkType,
  color?: MarkColor,
): boolean {
  const matching = marks
    .filter((mark) => sameMarkKind(mark, type, color))
    .sort((a, b) => a.start - b.start);
  let covered = range.start;
  for (const mark of matching) {
    if (mark.end <= covered) continue;
    if (mark.start > covered && !isGapExempt(text, covered, mark.start)) return false;
    covered = mark.end;
    if (covered >= range.end) return true;
  }
  // 尾部余量（选到文本末尾含尾随换行、或末行行首缩进）同样豁免。
  return isGapExempt(text, covered, range.end);
}

/** 清除选区内指定 type（不传 color = 该 type 全部颜色）的 marks，边界外保留。 */
export function clearMarksInRange(
  marks: TextMark[],
  range: { start: number; end: number },
  type?: MarkType,
  color?: MarkColor,
): TextMark[] {
  const result: TextMark[] = [];
  for (const mark of marks) {
    const hits = mark.end > range.start && mark.start < range.end && sameMarkKind(mark, type, color);
    if (!hits) {
      result.push(mark);
      continue;
    }
    if (mark.start < range.start) result.push({ ...mark, end: range.start });
    if (mark.end > range.end) result.push({ ...mark, start: range.end });
  }
  return mergeMarkList(result);
}

/** 选区按行拆段生成新 marks（换行符本身不带 mark）。 */
function buildRangeMarks(
  text: string,
  range: { start: number; end: number },
  type: MarkType,
  color?: MarkColor,
): TextMark[] {
  const marks: TextMark[] = [];
  let segmentStart: number | null = null;
  for (let index = range.start; index <= range.end; index += 1) {
    const isContent = index < range.end && text[index] !== "\n";
    if (isContent && segmentStart === null) segmentStart = index;
    if (!isContent && segmentStart !== null) {
      marks.push(color ? { type, start: segmentStart, end: index, color } : { type, start: segmentStart, end: index });
      segmentStart = null;
    }
  }
  return marks;
}

/** toggle：选区已带该款 → 整段移除；否则清同 type 冲突后按行补满选区。 */
export function toggleMarkInRange(
  text: string,
  marks: TextMark[],
  range: { start: number; end: number },
  type: MarkType,
  color?: MarkColor,
): TextMark[] {
  if (isRangeFullyMarked(text, marks, range, type, color)) {
    return clearMarksInRange(marks, range, type, color);
  }
  const cleared = clearMarksInRange(marks, range, type);
  return mergeMarkList([...cleared, ...buildRangeMarks(text, range, type, color)]);
}

export interface MirrorSegment {
  chunk: string;
  highlight?: MarkColor;
  strike?: boolean;
  underline?: boolean;
  color?: MarkColor;
}

/** 镜像层分段：按全部 mark 边界切文本，聚合每段的行内样式（重叠颜色取 start 更晚者）。 */
export function buildMirrorSegments(text: string, marks: TextMark[]): MirrorSegment[] {
  if (text.length === 0) return [];
  const sanitized = marks
    .map((mark) => ({ ...mark, end: Math.min(mark.end, text.length) }))
    .filter((mark) => mark.start < mark.end && mark.start < text.length);
  if (sanitized.length === 0) return [{ chunk: text }];
  const boundaries = new Set<number>([0, text.length]);
  for (const mark of sanitized) {
    boundaries.add(mark.start);
    boundaries.add(mark.end);
  }
  const points = [...boundaries].sort((a, b) => a - b);
  const segments: MirrorSegment[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const segment: MirrorSegment = { chunk: text.slice(start, end) };
    let latestHighlightStart = -1;
    let latestColorStart = -1;
    for (const mark of sanitized) {
      if (mark.start >= end || mark.end <= start) continue;
      if (mark.type === "highlight" && mark.start > latestHighlightStart) {
        latestHighlightStart = mark.start;
        segment.highlight = mark.color;
      }
      if (mark.type === "color" && mark.start > latestColorStart) {
        latestColorStart = mark.start;
        segment.color = mark.color;
      }
      if (mark.type === "strike") segment.strike = true;
      if (mark.type === "underline") segment.underline = true;
    }
    segments.push(segment);
  }
  return segments;
}
