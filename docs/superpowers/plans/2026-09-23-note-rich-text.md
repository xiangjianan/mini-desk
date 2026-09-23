# 记事本富文本标注（高亮 / 中划线 / 文字颜色）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为记事本（`TextPanel.vue` 的 textarea）增加行内标注格式——背景色高亮、中划线、下划线、文字颜色——格式存为 `LineItem.marks` 平行元数据，经镜像渲染层显示，编辑器内核与全部既有行为不动。

**Architecture:** textarea 文字透明化，其下叠一个排版完全一致的镜像 `<div>`（`.text-mirror`）按 marks 渲染带样式的 `<span>`。文本变更时由「偏移平移器」（行前缀/后缀对齐 + 中段按位配对 + 行内前后缀 diff）统一平移 marks 偏移；打字、粘贴、IME、AI 润色替换、撤销、自动重编号全部走同一通道。存储侧 normalize 修剪非法 marks，序列化深拷贝；旧数据无 marks 字段 = 无格式，零迁移。

**Tech Stack:** Vue 3 `<script setup>` + TS + vitest（`src/__tests__/`，jsdom）。零新增运行时依赖；图标用已装 `lucide-vue-next`。

**Spec:** `docs/superpowers/specs/2026-09-23-note-rich-text-design.md`

**关键现状（已核实）：**
- 记事本 = `SpacePanel.vue` 空间 Tab 共用唯一 `TextPanel.vue`，底层单个 `<textarea class="text-editor-textarea board-textarea large-textarea">`（`TextPanel.vue:758-781`），外层 `.text-editor-frame`（`position:relative`）+ `NScrollbar`；textarea 是**内部滚动**（`scrollTop`）。
- 行数据 `LineItem { text, indent }`（`src/types.ts:46-49`）；`normalizeLineCollection`（`src/state/storage/normalize.ts:301-319`）重建行对象（**未知字段会被丢弃**）；`cloneLines`（`src/state/storage/serialize.ts:149-151`）`{ ...line }` 浅拷贝。
- `src/utils/textEditor.ts`：`textLinesToEditorText` / `editorTextToLines`（10-24 行，内部跑 `renumberOrderedListText`）、`INDENT_UNIT = "    "`（6 行）、`getIndentInfo`（439 行）。
- TextPanel 内 `text` ref + `undoStack: string[]`（62-63 行）+ `recordUndoForText` / `undoLastTextChange`（707-723 行）；右键菜单 `menuOptions`（101-124 行）+ `handleMenuSelect`（479-512 行）；`handleKeydown`（153-188 行）已有 `isImeComposing` 守卫。
- 测试命令：`npx vitest run <file>`（在仓库根）；组件测试用 `@vue/test-utils` mount + `menuDropdownStub`（`src/__tests__/helpers/menu-dropdown-stub.ts`，按 `data-key` 精确点选任意层级）。
- lucide 图标已确认存在：`Highlighter` `Palette` `Paintbrush` `Strikethrough` `Underline` `RemoveFormatting`。
- `src/state/storage.ts` 是桶文件，`normalizeImportedState` / `getSerializableState` / `isPlainObject` 均可从此导入。

---

### Task 1: 类型定义 + marks 核心纯函数（normalize / merge / translate）

**Files:**
- Modify: `src/types.ts`（46-49 行 `LineItem` 附近）
- Create: `src/utils/textMarks.ts`
- Test: `src/__tests__/text-marks.test.ts`

- [ ] **Step 1: 写失败测试（第一批：normalize / merge / translate）**

创建 `src/__tests__/text-marks.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { mergeMarkList, normalizeMarkList, translateMarksForEdit } from "../utils/textMarks";
import type { TextMark } from "../types";

const hl = (start: number, end: number, color: TextMark["color"] = "amber"): TextMark =>
  ({ type: "highlight", start, end, color });

describe("normalizeMarkList — 入口修剪", () => {
  it("丢弃非数组输入与非法项，clamp 越界偏移", () => {
    expect(normalizeMarkList(undefined, 10)).toEqual([]);
    expect(normalizeMarkList("nope", 10)).toEqual([]);
    expect(normalizeMarkList([{ type: "strike", start: 2, end: 1 }], 10)).toEqual([]);
    expect(normalizeMarkList([{ type: "highlight", start: 5, end: 20 }], 10)).toEqual([hl(5, 10)]);
    expect(normalizeMarkList([{ type: "unknown", start: 0, end: 3 }], 10)).toEqual([]);
    expect(normalizeMarkList([{ type: "highlight", start: 0, end: 3 }], 10)).toEqual([]);
    expect(normalizeMarkList([{ type: "color", start: 0, end: 3, color: "pink" }], 10)).toEqual([]);
  });

  it("strike/underline 剥离多余 color，highlight/color 必须带合法 color", () => {
    expect(normalizeMarkList([{ type: "strike", start: 0, end: 3, color: "amber" }], 10))
      .toEqual([{ type: "strike", start: 0, end: 3 }]);
    expect(normalizeMarkList([{ type: "color", start: 0, end: 3, color: "rose" }], 10))
      .toEqual([{ type: "color", start: 0, end: 3, color: "rose" }]);
  });

  it("排序并合并相邻/重叠的同款 marks", () => {
    expect(normalizeMarkList([
      { type: "strike", start: 4, end: 6 },
      { type: "strike", start: 0, end: 4 },
      { type: "strike", start: 8, end: 9 },
    ], 12)).toEqual([{ type: "strike", start: 0, end: 6 }, { type: "strike", start: 8, end: 9 }]);
    // 同区间不同色不合并
    expect(normalizeMarkList([hl(0, 3, "rose"), hl(0, 3, "amber")], 10))
      .toEqual([hl(0, 3, "rose"), hl(0, 3, "amber")]);
  });
});

describe("mergeMarkList — 排序与同款合并", () => {
  it("合并端点相接的同款段", () => {
    expect(mergeMarkList([{ type: "underline", start: 0, end: 2 }, { type: "underline", start: 2, end: 4 }]))
      .toEqual([{ type: "underline", start: 0, end: 4 }]);
  });
});

describe("translateMarksForEdit — 文本变更平移", () => {
  it("文本未变时原样返回", () => {
    const marks = [hl(0, 3)];
    expect(translateMarksForEdit(marks, "abc", "abc")).toBe(marks);
  });

  it("高亮中间打字：区间扩张", () => {
    expect(translateMarksForEdit([hl(1, 4)], "abcd", "abXcd")).toEqual([hl(1, 5)]);
  });

  it("恰在 mark 起点插入：起点随插入右移（插入文字不进高亮），终点在插入点后则不动", () => {
    expect(translateMarksForEdit([hl(2, 5)], "ab>cde", "abX>cde")).toEqual([hl(3, 6)]);
    expect(translateMarksForEdit([hl(0, 2)], "ab", "XYab")).toEqual([hl(2, 4)]);
  });

  it("删除高亮内文字：区间收缩；整段删除则消失", () => {
    expect(translateMarksForEdit([hl(1, 4)], "abcd", "ad")).toEqual([hl(1, 2)]);
    expect(translateMarksForEdit([hl(1, 4)], "abcd", "a")).toEqual([]);
  });

  it("多行文本在未改动行打字：其他行的 marks 不动", () => {
    expect(translateMarksForEdit([hl(0, 2)], "ab\ncd", "ab\ncXd")).toEqual([hl(0, 2)]);
  });

  it("重编号前缀增长 9.→10.：标记后的偏移随前缀平移", () => {
    expect(translateMarksForEdit([hl(3, 4)], "9. 丙重点", "10. 丙重点")).toEqual([hl(4, 5)]);
  });

  it("上方插行引发级联重编号：每行按行内 diff 平移，不丢不串", () => {
    expect(translateMarksForEdit([hl(8, 9)], "8. 乙\n9. 丙", "9. 乙\n10. 丙")).toEqual([hl(9, 10)]);
  });

  it("Enter 断行：断点后的 mark 被裁剪（不复活也不错位）", () => {
    expect(translateMarksForEdit([hl(2, 3)], "abc\nrest", "a\nbc\nrest")).toEqual([]);
    expect(translateMarksForEdit([hl(0, 1)], "abc\nrest", "a\nbc\nrest")).toEqual([hl(0, 1)]);
  });

  it("整块行删除：区间内 marks 消失，其后 marks 平移", () => {
    expect(translateMarksForEdit([hl(0, 2), hl(4, 5)], "ab\ncd\nef", "ab\nef")).toEqual([hl(0, 2)]);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/__tests__/text-marks.test.ts`
Expected: FAIL（`Cannot find module '../utils/textMarks'` 或同类解析错误）

- [ ] **Step 3: 写类型与实现**

`src/types.ts` —— 在 `LineItem`（46-49 行）之前插入 mark 类型，并给 `LineItem` 加可选字段：

```ts
/** 记事本行内标注格式：全部为不改变字形宽度的格式（镜像渲染层的前提）。 */
export type MarkType = "highlight" | "strike" | "underline" | "color";
/** 语义色名：明暗主题由 CSS 变量各自映射，不存裸 CSS 值。 */
export type MarkColor = "amber" | "rose" | "green" | "blue" | "violet";
/** [start, end) 相对 line.text（不含 4 空格缩进）。strike/underline 无 color；highlight/color 必带。 */
export interface TextMark {
  type: MarkType;
  start: number;
  end: number;
  color?: MarkColor;
}

export interface LineItem {
  text: string;
  indent: number;
  marks?: TextMark[];
}
```

创建 `src/utils/textMarks.ts`：

```ts
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/__tests__/text-marks.test.ts`
Expected: PASS（全部用例）

- [ ] **Step 5: 提交**

```bash
git add src/types.ts src/utils/textMarks.ts src/__tests__/text-marks.test.ts
git commit -m "feat: marks 元数据模型与文本变更平移器（记事本富文本地基）"
```

---

### Task 2: toggle / clear / 镜像分段（textMarks 第二批）

**Files:**
- Modify: `src/utils/textMarks.ts`（文件末尾追加）
- Test: `src/__tests__/text-marks.test.ts`（追加）

- [ ] **Step 1: 写失败测试（第二批）**

在 `src/__tests__/text-marks.test.ts` 末尾追加：

```ts
import { buildMirrorSegments, clearMarksInRange, toggleMarkInRange } from "../utils/textMarks";

describe("toggleMarkInRange — toggle 语义", () => {
  it("未覆盖 → 施加；再施加同款 → 整段移除", () => {
    const once = toggleMarkInRange("hello world", [], { start: 6, end: 11 }, "highlight", "amber");
    expect(once).toEqual([hl(6, 11)]);
    expect(toggleMarkInRange("hello world", once, { start: 6, end: 11 }, "highlight", "amber")).toEqual([]);
  });

  it("高亮换色：先清同 type 全色，再上新色", () => {
    const rose = toggleMarkInRange("hello", [], { start: 0, end: 5 }, "highlight", "rose");
    expect(toggleMarkInRange("hello", rose, { start: 0, end: 5 }, "highlight", "amber")).toEqual([hl(0, 5, "amber")]);
  });

  it("部分覆盖时补满整段（strike 无色款）", () => {
    const partial: TextMark[] = [{ type: "strike", start: 0, end: 2 }];
    expect(toggleMarkInRange("hello", partial, { start: 0, end: 5 }, "strike"))
      .toEqual([{ type: "strike", start: 0, end: 5 }]);
  });

  it("跨行选区：按行拆段，换行符本身不带 mark", () => {
    expect(toggleMarkInRange("ab\ncd", [], { start: 1, end: 4 }, "strike"))
      .toEqual([{ type: "strike", start: 1, end: 2 }, { type: "strike", start: 3, end: 4 }]);
  });

  it("跨行已全覆盖 → 一次取消（换行符豁免判定）", () => {
    const marks: TextMark[] = [
      { type: "strike", start: 1, end: 2 },
      { type: "strike", start: 3, end: 4 },
    ];
    expect(toggleMarkInRange("ab\ncd", marks, { start: 1, end: 4 }, "strike")).toEqual([]);
  });
});

describe("clearMarksInRange — 清除", () => {
  it("清除指定 type（跨全部颜色），保留其余", () => {
    const marks: TextMark[] = [hl(0, 4, "rose"), hl(0, 4, "amber"), { type: "strike", start: 0, end: 4 }];
    expect(clearMarksInRange(marks, { start: 0, end: 4 }, "highlight"))
      .toEqual([{ type: "strike", start: 0, end: 4 }]);
  });

  it("清除选区外的部分保留（裁剪到边界）", () => {
    const marks: TextMark[] = [hl(0, 5)];
    expect(clearMarksInRange(marks, { start: 2, end: 4 })).toEqual([hl(0, 2), hl(4, 5)]);
  });

  it("不传 type 清除一切格式", () => {
    const marks: TextMark[] = [hl(0, 2), { type: "underline", start: 1, end: 3 }];
    expect(clearMarksInRange(marks, { start: 0, end: 3 })).toEqual([]);
  });
});

describe("buildMirrorSegments — 镜像分段", () => {
  it("无 marks 时整段一次输出", () => {
    expect(buildMirrorSegments("hello", [])).toEqual([{ chunk: "hello" }]);
  });

  it("按 mark 边界切段，行内样式聚合", () => {
    const segments = buildMirrorSegments("abcdef", [hl(2, 5), { type: "strike", start: 4, end: 6 }]);
    expect(segments).toEqual([
      { chunk: "ab" },
      { chunk: "cde", highlight: "amber" },
      { chunk: "ef", highlight: "amber", strike: true },
    ]);
  });

  it("文字颜色与高亮可叠加；越界 mark 被夹回文本长度", () => {
    const segments = buildMirrorSegments("abc", [
      { type: "color", start: 1, end: 3, color: "rose" },
      hl(0, 99),
    ]);
    expect(segments).toEqual([
      { chunk: "a", highlight: "amber" },
      { chunk: "bc", highlight: "amber", color: "rose" },
    ]);
  });
});
```

（import 语句合并进文件顶部的既有 import：`buildMirrorSegments, clearMarksInRange, toggleMarkInRange` 并入第一条 import。）

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/__tests__/text-marks.test.ts`
Expected: FAIL（`buildMirrorSegments` / `toggleMarkInRange` / `clearMarksInRange` 不存在）

- [ ] **Step 3: 实现（追加到 textMarks.ts 末尾）**

```ts
/** 选区（跨行时换行符本身豁免）是否每一段都被同款 mark 完整覆盖。 */
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
    if (mark.start > covered) {
      let gapsAreNewlines = true;
      for (let index = covered; index < mark.start; index += 1) {
        if (text[index] !== "\n") {
          gapsAreNewlines = false;
          break;
        }
      }
      if (!gapsAreNewlines) return false;
    }
    covered = mark.end;
    if (covered >= range.end) return true;
  }
  return false;
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
```

注意 `sameMarkKind` 的语义配合：`clearMarksInRange(marks, range, "highlight")`（不传 color）清全部颜色；传 color 只清该色。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/__tests__/text-marks.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/utils/textMarks.ts src/__tests__/text-marks.test.ts
git commit -m "feat: marks toggle/清除语义与镜像分段构建"
```

---

### Task 3: textEditor.ts 的 EditorState 双向转换

**Files:**
- Modify: `src/utils/textEditor.ts`（10-24 行区域）
- Test: `src/__tests__/text-editor.test.ts`（追加 describe）

- [ ] **Step 1: 写失败测试**

在 `src/__tests__/text-editor.test.ts` 顶部 import 加入 `editorStateFromLines, linesFromEditorState`，文件末尾追加：

```ts
describe("editorStateFromLines / linesFromEditorState — marks 双向携带", () => {
  it("拼接时把行内 marks 映射到全文坐标（缩进计入 base）", () => {
    const state = editorStateFromLines([
      { text: "标题", indent: 0 },
      { text: "重点内容", indent: 1, marks: [{ type: "highlight", start: 0, end: 2, color: "amber" }] },
    ]);
    expect(state.text).toBe("标题\n    重点内容");
    expect(state.marks).toEqual([{ type: "highlight", start: 7, end: 9, color: "amber" }]);
  });

  it("拆行时把全文 marks 切回行内坐标，无 marks 的行不挂字段", () => {
    const lines = linesFromEditorState("标题\n    重点内容", [
      { type: "highlight", start: 7, end: 9, color: "amber" },
    ]);
    expect(lines).toEqual([
      { text: "标题", indent: 0 },
      { text: "重点内容", indent: 1, marks: [{ type: "highlight", start: 0, end: 2, color: "amber" }] },
    ]);
  });

  it("renumber 改写前缀时 marks 随文本平移", () => {
    const state = editorStateFromLines([
      { text: "1. 甲", indent: 0 },
      { text: "1. 乙重点", indent: 0, marks: [{ type: "strike", start: 4, end: 6 }] },
    ]);
    expect(state.text).toBe("1. 甲\n2. 乙重点");
    expect(state.marks).toEqual([{ type: "strike", start: 9, end: 11 }]);
  });

  it("旧契约保持：textLinesToEditorText / editorTextToLines 输出不变", () => {
    expect(textLinesToEditorText([{ text: "a", indent: 1 }])).toBe("    a");
    expect(editorTextToLines("    a")).toEqual([{ text: "a", indent: 1 }]);
  });

  it("全文坐标跨行 mark 在拆行时防御性截断为两段", () => {
    const lines = linesFromEditorState("ab\ncd", [{ type: "strike", start: 1, end: 4 }]);
    expect(lines).toEqual([
      { text: "ab", indent: 0, marks: [{ type: "strike", start: 1, end: 2 }] },
      { text: "cd", indent: 0, marks: [{ type: "strike", start: 0, end: 2 }] },
    ]);
  });
});
```

（顶部 import 同时补 `textLinesToEditorText` 若尚未导入。）

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/__tests__/text-editor.test.ts`
Expected: FAIL（新函数不存在）

- [ ] **Step 3: 实现**

`src/utils/textEditor.ts` 顶部 import 区（第 1-2 行）改为：

```ts
import type { LineItem, TextMark } from "../types";
import { serializeTextLines, textLinesToText } from "../state/storage";
import { translateMarksForEdit } from "./textMarks";
```

将 10-24 行的两个函数替换为（`renumberOrderedListText` 本体不动）：

```ts
export interface EditorState {
  text: string;
  marks: TextMark[];
}

export function textLinesToEditorText(lines: LineItem[]): string {
  return editorStateFromLines(lines).text;
}

export function editorTextToLines(value = ""): LineItem[] {
  return linesFromEditorState(value);
}

/** 行列表 → 编辑器全文态：行内 marks 映射到全文坐标（base = 行首 + 缩进），随后跑重编号。 */
export function editorStateFromLines(lines: LineItem[]): EditorState {
  let text = "";
  const marks: TextMark[] = [];
  for (const line of lines) {
    if (text.length > 0) text += "\n";
    const indentText = INDENT_UNIT.repeat(Math.max(0, line.indent));
    const base = text.length + indentText.length;
    text += `${indentText}${line.text}`;
    for (const mark of line.marks ?? []) {
      marks.push({ ...mark, start: base + mark.start, end: base + mark.end });
    }
  }
  const renumbered = renumberOrderedListText(text);
  return {
    text: renumbered,
    marks: renumbered === text ? marks : translateMarksForEdit(marks, text, renumbered),
  };
}

/** 编辑器全文态 → 行列表：先重编号（marks 同步平移），再逐行拆缩进并把全文 marks 切回行内。 */
export function linesFromEditorState(value = "", marks: TextMark[] = []): LineItem[] {
  const renumbered = renumberOrderedListText(value);
  const fullTextMarks = renumbered === value
    ? marks.map((mark) => ({ ...mark }))
    : translateMarksForEdit(marks, value, renumbered);
  if (!renumbered) return [];
  const result: LineItem[] = [];
  let lineStart = 0;
  for (const line of renumbered.split("\n")) {
    const indent = getIndentInfo(line);
    const contentStart = lineStart + indent.contentStart;
    const lineEnd = lineStart + line.length;
    const lineMarks: TextMark[] = [];
    for (const mark of fullTextMarks) {
      const start = Math.max(mark.start, contentStart) - contentStart;
      const end = Math.min(mark.end, lineEnd) - contentStart;
      if (start < end) lineMarks.push({ ...mark, start, end });
    }
    result.push({
      text: line.slice(indent.contentStart),
      indent: indent.depth,
      ...(lineMarks.length > 0 ? { marks: lineMarks } : {}),
    });
    lineStart = lineEnd + 1;
  }
  return result;
}
```

- [ ] **Step 4: 跑测试确认通过（含旧用例不回归）**

Run: `npx vitest run src/__tests__/text-editor.test.ts src/__tests__/text-panel.test.ts src/__tests__/space-panel.test.ts`
Expected: PASS（旧契约由 Step 1 的第 4 个用例 + 既有套件守护）

- [ ] **Step 5: 提交**

```bash
git add src/utils/textEditor.ts src/__tests__/text-editor.test.ts
git commit -m "feat: editorStateFromLines/linesFromEditorState 携带 marks 的双向转换"
```

---

### Task 4: 存储链路（normalize 修剪 + serialize 深拷贝）

**Files:**
- Modify: `src/state/storage/normalize.ts:301-319`（`normalizeLineCollection`）
- Modify: `src/state/storage/serialize.ts:149-151`（`cloneLines`）
- Test: `src/__tests__/text-marks-storage.test.ts`（新建）

- [ ] **Step 1: 写失败测试**

创建 `src/__tests__/text-marks-storage.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { getSerializableState, normalizeImportedState } from "../state/storage";
import type { BoardState } from "../types";

function workspaceWithMarks() {
  return {
    workspaces: [{
      id: "ws-1",
      spaces: [{
        id: "sp-1",
        title: "便签",
        lines: [
          { text: "重点内容", indent: 0, marks: [{ type: "highlight", start: 0, end: 2, color: "amber" }] },
          { text: "作废", indent: 0, marks: [{ type: "strike", start: 0, end: 2 }, { type: "nope", start: 0, end: 1 }] },
          { text: "越界", indent: 0, marks: [{ type: "color", start: 0, end: 9, color: "rose" }] },
        ],
      }],
    }],
  };
}

describe("marks 存储链路", () => {
  it("normalizeImportedState 修剪非法 marks 并 clamp 越界", () => {
    const state = normalizeImportedState(workspaceWithMarks() as unknown as Parameters<typeof normalizeImportedState>[0]) as BoardState;
    const lines = state.workspaces[0].spaces[0].lines;
    expect(lines[0].marks).toEqual([{ type: "highlight", start: 0, end: 2, color: "amber" }]);
    expect(lines[1].marks).toEqual([{ type: "strike", start: 0, end: 2 }]);
    expect(lines[2].marks).toEqual([{ type: "color", start: 0, end: 2, color: "rose" }]);
  });

  it("无 marks 字段的旧数据照常加载（零迁移）", () => {
    const payload = { workspaces: [{ id: "ws-1", spaces: [{ id: "sp-1", lines: [{ text: "旧数据", indent: 0 }] }] }] };
    const state = normalizeImportedState(payload as unknown as Parameters<typeof normalizeImportedState>[0]) as BoardState;
    expect(state.workspaces[0].spaces[0].lines).toEqual([{ text: "旧数据", indent: 0 }]);
  });

  it("序列化深拷贝 marks（改副本不影响原件），且往返一致", () => {
    const state = normalizeImportedState(workspaceWithMarks() as unknown as Parameters<typeof normalizeImportedState>[0]) as BoardState;
    const serialized = getSerializableState(state);
    const marks = serialized.workspaces[0].spaces[0].lines[0].marks!;
    marks[0] = { ...marks[0], color: "rose" };
    expect(state.workspaces[0].spaces[0].lines[0].marks?.[0].color).toBe("amber");
    const roundtrip = normalizeImportedState(JSON.parse(JSON.stringify(getSerializableState(state))) as unknown as Parameters<typeof normalizeImportedState>[0]) as BoardState;
    expect(roundtrip.workspaces[0].spaces[0].lines[0].marks)
      .toEqual(state.workspaces[0].spaces[0].lines[0].marks);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/__tests__/text-marks-storage.test.ts`
Expected: FAIL（marks 被 normalize 剥掉 / cloneLines 浅拷贝）

- [ ] **Step 3: 实现**

`normalize.ts`：import 区加入 `import { normalizeMarkList } from "../../utils/textMarks";`，`normalizeLineCollection` 的行构造（313-316 行）改为：

```ts
      const text = typeof record.text === "string" ? record.text : "";
      const marks = normalizeMarkList(record.marks, text.length);
      return {
        text,
        indent: clampInteger(record.indent, 0, 12),
        ...(marks.length > 0 ? { marks } : {}),
      };
```

`serialize.ts`：`cloneLines`（149-151 行）改为：

```ts
export function cloneLines(lines: LineItem[]): LineItem[] {
  return lines.map((line) => (line.marks?.length
    ? { ...line, marks: line.marks.map((mark) => ({ ...mark })) }
    : { ...line }));
}
```

- [ ] **Step 4: 跑测试确认通过 + 存量套件**

Run: `npx vitest run src/__tests__/text-marks-storage.test.ts src/__tests__/state.test.ts src/__tests__/storage-key-migration.test.ts src/__tests__/import-samples.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/state/storage/normalize.ts src/state/storage/serialize.ts src/__tests__/text-marks-storage.test.ts
git commit -m "feat: marks 进存储写屏障（normalize 修剪）与序列化深拷贝"
```

---

### Task 5: TextPanel 接入 marks 状态（commitEditorText + 撤销快照升级）

**Files:**
- Modify: `src/components/TextPanel.vue`（script 多处，见下）
- Test: `src/__tests__/text-panel.test.ts`（追加）

- [ ] **Step 1: 写失败测试**

在 `src/__tests__/text-panel.test.ts` 的 `describe("TextPanel", ...)` 内追加（文件顶部已 import `TextPanel`；补 `import type { LineItem } from "../types";` 若尚未导入）：

```ts
  it("marks 随编辑平移：高亮前打字偏移右移并随 update 上报", async () => {
    const wrapper = mount(TextPanel, {
      props: {
        titleId: "workspace-title",
        title: "工作空间",
        lines: [{ text: "hello world", indent: 0, marks: [{ type: "highlight", start: 6, end: 11, color: "amber" }] }],
      },
    });
    await wrapper.get("textarea").trigger("dblclick");
    await wrapper.get("textarea").setValue("hello brave world");
    const update = wrapper.emitted("update")?.at(-1)?.[0] as LineItem[];
    expect(update[0].marks).toEqual([{ type: "highlight", start: 12, end: 17, color: "amber" }]);
  });

  it("本地撤销把文本与 marks 一起还原", async () => {
    const wrapper = mount(TextPanel, {
      props: {
        titleId: "workspace-title",
        title: "工作空间",
        lines: [{ text: "hello world", indent: 0, marks: [{ type: "strike", start: 0, end: 5 }] }],
      },
    });
    const textarea = wrapper.get("textarea").element;
    await wrapper.get("textarea").trigger("dblclick");
    await wrapper.get("textarea").setValue("hello new world");
    await wrapper.get("textarea").trigger("keydown", { key: "z", ctrlKey: true });
    expect(textarea.value).toBe("hello world");
    const update = wrapper.emitted("update")?.at(-1)?.[0] as LineItem[];
    expect(update[0].marks).toEqual([{ type: "strike", start: 0, end: 5 }]);
  });

  it("外部 lines 变化（如手机速记追加）重建 marks 且不丢既有格式", async () => {
    const wrapper = mount(TextPanel, {
      props: {
        titleId: "workspace-title",
        title: "工作空间",
        lines: [{ text: "重点", indent: 0, marks: [{ type: "highlight", start: 0, end: 2, color: "rose" }] }],
      },
    });
    await wrapper.setProps({
      lines: [
        { text: "重点", indent: 0, marks: [{ type: "highlight", start: 0, end: 2, color: "rose" }] },
        { text: "速记新行", indent: 0 },
      ],
    });
    await wrapper.get("textarea").trigger("dblclick");
    await wrapper.get("textarea").setValue("重点\n速记新行\n再来一行");
    const update = wrapper.emitted("update")?.at(-1)?.[0] as LineItem[];
    expect(update[0].marks).toEqual([{ type: "highlight", start: 0, end: 2, color: "rose" }]);
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/__tests__/text-panel.test.ts`
Expected: FAIL（update 上报的 lines 不含 marks / 撤销后 marks 丢失）

- [ ] **Step 3: 实现（TextPanel.vue 逐处修改）**

3a. import 区（8 行、12-22 行）：

```ts
import type { LineItem, TextMark } from "../types";
```

textEditor import 块改为（`textLinesToEditorText`、`editorTextToLines` 移除，新增两个）：

```ts
import {
  editorStateFromLines,
  getLineTextStartOffset,
  handleTextareaTab,
  insertIndentedLineBreak,
  insertPlainLineBreak,
  linesFromEditorState,
  moveCaretToLineBoundary,
  moveTextareaLine,
  renumberOrderedListText,
} from "../utils/textEditor";
import { translateMarksForEdit } from "../utils/textMarks";
```

3b. 状态初始化（58 行与 62-63 行）替换为：

```ts
const initialEditorState = editorStateFromLines(props.lines);
const text = ref(initialEditorState.text);
const editorMarks = ref<TextMark[]>(initialEditorState.marks);
const committedText = ref(initialEditorState.text);

interface EditorSnapshot {
  text: string;
  marks: TextMark[];
}

const undoStack = ref<EditorSnapshot[]>([]);
const lastUndoState = ref<EditorSnapshot>({ text: initialEditorState.text, marks: initialEditorState.marks });
```

3c. 外部 lines watcher（126-137 行）替换为：

```ts
watch(
  () => props.lines,
  (lines) => {
    const next = editorStateFromLines(lines);
    if (next.text === text.value && isSameMarks(next.marks, editorMarks.value)) return;
    text.value = next.text;
    committedText.value = next.text;
    editorMarks.value = next.marks;
    undoStack.value = [];
    lastUndoState.value = { text: next.text, marks: [...next.marks] };
  },
  { deep: true },
);
```

并在 script 中新增辅助：

```ts
function isSameMarks(left: TextMark[], right: TextMark[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((mark, index) => {
    const other = right[index];
    return mark.type === other.type && mark.start === other.start && mark.end === other.end && mark.color === other.color;
  });
}
```

3d. `update()`（145-151 行）：

```ts
function update(): void {
  if (!editing.value) return;
  const textarea = textareaRef.value;
  if (textarea) normalizeTextareaText(textarea);
  else commitEditorText(text.value);
  emit("update", linesFromEditorState(text.value, editorMarks.value));
}
```

3e. `startEditingFromTextarea`（365-366 行的 `undoStack.value = []; lastUndoText.value = text.value;`）替换为：

```ts
  undoStack.value = [];
  lastUndoState.value = { text: committedText.value, marks: [...editorMarks.value] };
```

3f. `applyEditorText`（640-644 行）替换为薄封装：

```ts
function applyEditorText(next: string): void {
  commitEditorText(next);
}
```

3g. `normalizeTextareaText`（646-663 行）替换为：

```ts
function normalizeTextareaText(textarea: HTMLTextAreaElement): void {
  const raw = textarea.value;
  const normalized = renumberOrderedListText(raw);
  if (normalized !== raw) {
    const selectionStart = textarea.selectionStart ?? raw.length;
    const selectionEnd = textarea.selectionEnd ?? selectionStart;
    const nextSelectionStart = getAdjustedSelectionOffset(raw, normalized, selectionStart);
    const nextSelectionEnd = getAdjustedSelectionOffset(raw, normalized, selectionEnd);
    textarea.value = normalized;
    textarea.setSelectionRange(nextSelectionStart, nextSelectionEnd);
  }
  commitEditorText(normalized);
}
```

3h. `recordUndoForText`（707-711 行）替换为两个函数：

```ts
function recordUndoState(): void {
  undoStack.value = [...undoStack.value.slice(-49), lastUndoState.value];
  lastUndoState.value = { text: committedText.value, marks: [...editorMarks.value] };
}

/** 所有文本变更的唯一入口：marks 平移、undo 快照、text/DOM 同步都在这里。 */
function commitEditorText(next: string): void {
  if (next === committedText.value) return;
  editorMarks.value = translateMarksForEdit(editorMarks.value, committedText.value, next);
  committedText.value = next;
  recordUndoState();
  text.value = next;
  const textarea = textareaRef.value;
  if (textarea && textarea.value !== next) textarea.value = next;
}
```

3i. `undoLastTextChange`（713-723 行）替换为：

```ts
function undoLastTextChange(textarea: HTMLTextAreaElement): void {
  const previous = undoStack.value.at(-1);
  if (!previous) return;
  undoStack.value = undoStack.value.slice(0, -1);
  editorMarks.value = [...previous.marks];
  committedText.value = previous.text;
  text.value = previous.text;
  textarea.value = previous.text;
  lastUndoState.value = { text: previous.text, marks: [...previous.marks] };
  const caret = Math.min(previous.text.length, textarea.selectionStart ?? previous.text.length);
  textarea.setSelectionRange(caret, caret);
  emit("update", linesFromEditorState(previous.text, previous.marks));
}
```

3j. 其余 `emit("update", editorTextToLines(text.value))` 全部（310、552、562、618 行共 4 处）替换为：

```ts
  emit("update", linesFromEditorState(text.value, editorMarks.value));
```

（150 行已在 3d 覆盖；722 行已在 3i 覆盖。）

- [ ] **Step 4: 跑测试确认通过（含全量组件套件）**

Run: `npx vitest run src/__tests__/text-panel.test.ts src/__tests__/space-panel.test.ts src/__tests__/app-render.test.ts`
Expected: PASS（app-render 有一个已知 IndexedDB stub 的既有报错，重跑一次即可，见 CLAUDE.md）

- [ ] **Step 5: 提交**

```bash
git add src/components/TextPanel.vue src/__tests__/text-panel.test.ts
git commit -m "feat: TextPanel 编辑全链路携带 marks（commitEditorText 统一入口 + 撤销快照升级）"
```

---

### Task 6: 镜像渲染层（模板 + CSS + 滚动同步）

**Files:**
- Modify: `src/components/TextPanel.vue`（script + template）
- Modify: `src/styles.css`（913-943 区域、5475-5478、`:root` 与暗色主题块、文件末尾追加 mark 样式）
- Test: `src/__tests__/text-panel.test.ts`（追加）、`src/__tests__/style-contract.test.ts`（追加）

- [ ] **Step 1: 写失败测试**

`src/__tests__/text-panel.test.ts` 追加：

```ts
  it("镜像层按 marks 渲染带样式的 span（只读态同样可见）", () => {
    const wrapper = mount(TextPanel, {
      props: {
        titleId: "workspace-title",
        title: "工作空间",
        lines: [{ text: "重点内容普通", indent: 0, marks: [
          { type: "highlight", start: 0, end: 2, color: "amber" },
          { type: "strike", start: 4, end: 6 },
        ] }],
      },
    });
    expect(wrapper.get(".text-mirror").text()).toBe("重点内容普通");
    expect(wrapper.get(".text-mirror .mark-highlight-amber").text()).toBe("重点");
    expect(wrapper.get(".text-mirror .mark-strike").text()).toBe("普通");
  });

  it("textarea 滚动时镜像层同步 scrollTop", async () => {
    const wrapper = mount(TextPanel, {
      props: { titleId: "workspace-title", title: "工作空间", lines: [{ text: "a", indent: 0 }] },
    });
    const textarea = wrapper.get("textarea").element;
    textarea.scrollTop = 40;
    await wrapper.get("textarea").trigger("scroll");
    expect(wrapper.get(".text-mirror").element.scrollTop).toBe(40);
  });
```

`src/__tests__/style-contract.test.ts` 的 describe 内追加（复用既有 `ruleBodies` helper）：

```ts
  it("keeps mirror typography paired with the transparent textarea (no drift)", () => {
    const styles = readFileSync(resolve(__dirname, "../styles.css"), "utf8");
    const textareaBodies = ruleBodies(styles, ".text-editor-textarea");
    const mirrorBodies = ruleBodies(styles, ".text-mirror");
    for (const body of textareaBodies) {
      if (/padding|line-height|font|letter-spacing|tab-size|white-space|overflow-wrap/.test(body)) {
        expect(mirrorBodies).toContain(body);
      }
    }
    expectSelectorBody(styles, ".text-editor-textarea", "color: transparent");
    expectSelectorBody(styles, ".text-editor-textarea", "caret-color: var(--text)");
    expectSelectorBody(styles, ".text-mirror", "position: absolute");
    expectSelectorBody(styles, ".text-mirror", "pointer-events: none");
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/__tests__/text-panel.test.ts src/__tests__/style-contract.test.ts`
Expected: FAIL（`.text-mirror` 不存在）

- [ ] **Step 3: 实现**

3a. `TextPanel.vue` script —— import 补充：

```ts
import { buildMirrorSegments } from "../utils/textMarks";
```

（并入既有 textMarks import 行。）新增状态与计算：

```ts
const mirrorRef = ref<HTMLElement | null>(null);
const mirrorSegments = computed(() => buildMirrorSegments(text.value, editorMarks.value));

function mirrorSegmentClasses(segment: { highlight?: string; color?: string; strike?: boolean; underline?: boolean }): string[] {
  const classes: string[] = [];
  if (segment.highlight) classes.push(`mark-highlight-${segment.highlight}`);
  if (segment.color) classes.push(`mark-text-${segment.color}`);
  if (segment.strike) classes.push("mark-strike");
  if (segment.underline) classes.push("mark-underline");
  return classes;
}

function syncMirrorScroll(event: UIEvent): void {
  const textarea = event.currentTarget as HTMLTextAreaElement;
  if (mirrorRef.value) mirrorRef.value.scrollTop = textarea.scrollTop;
}
```

（`MirrorSegment` 类型从 textMarks import 一并引入，`mirrorSegmentClasses` 参数类型用 `MirrorSegment`。）

3b. template —— `.text-editor-frame` 内、`<NScrollbar>` 之前插入镜像层；textarea 加 `@scroll`：

```vue
    <div class="text-editor-frame" @contextmenu="openTextMenu" @dragover="handleDragOver" @drop="handleExternalTextDrop">
      <div ref="mirrorRef" class="text-mirror" aria-hidden="true"><span
        v-for="(segment, index) in mirrorSegments"
        :key="index"
        :class="mirrorSegmentClasses(segment)"
      >{{ segment.chunk }}</span></div>
      <NScrollbar class="text-editor-scrollbar">
      <textarea
        ...
        @wheel="handleTextareaWheel"
        @scroll="syncMirrorScroll"
        ...
```

3c. `src/styles.css` —— 四处修改：

（1）926-938 行的 `.text-editor-textarea` 规则改为共享排版规则 + textarea 专属规则：

```css
.text-editor-textarea,
.text-mirror {
  width: 100%;
  height: 100%;
  resize: none;
  border: 0;
  padding: 10px 12px;
  font-family: inherit;
  font-size: var(--app-font-size);
  line-height: 1.68;
  letter-spacing: 0.01em;
  tab-size: 4;
  white-space: pre-wrap;
  overflow-wrap: break-word;
}

.text-editor-textarea {
  color: transparent;
  caret-color: var(--text);
  background: transparent;
  position: relative;
  z-index: 1;
}
```

（2）940-943 行 `.workspace-panel .text-editor-textarea` 规则改为：

```css
.workspace-panel .text-editor-textarea,
.workspace-panel .text-mirror {
  padding: 14px 16px;
  line-height: 1.82;
}
```

（3）5475-5478 行的 `.text-editor-textarea` 覆盖块改为：

```css
.text-editor-textarea,
.text-mirror {
  padding: 12px 14px;
  line-height: 1.72;
}
```

（4）文件末尾追加镜像层与色板：

```css
/* ── 记事本富文本镜像层 ─────────────────────────────
   排版声明必须与 .text-editor-textarea 成对出现在同一条规则里
   （有 style-contract 测试守护），否则两层错位。 */

.text-mirror {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  color: var(--text);
  z-index: 0;
}

.text-mirror .mark-strike {
  text-decoration: line-through;
}

.text-mirror .mark-underline {
  text-decoration: underline;
}

.text-mirror .mark-highlight-amber { background: var(--mark-highlight-amber); border-radius: 2px; }
.text-mirror .mark-highlight-rose { background: var(--mark-highlight-rose); border-radius: 2px; }
.text-mirror .mark-highlight-green { background: var(--mark-highlight-green); border-radius: 2px; }
.text-mirror .mark-highlight-blue { background: var(--mark-highlight-blue); border-radius: 2px; }
.text-mirror .mark-highlight-violet { background: var(--mark-highlight-violet); border-radius: 2px; }

.text-mirror .mark-text-amber { color: var(--mark-text-amber); }
.text-mirror .mark-text-rose { color: var(--mark-text-rose); }
.text-mirror .mark-text-green { color: var(--mark-text-green); }
.text-mirror .mark-text-blue { color: var(--mark-text-blue); }
.text-mirror .mark-text-violet { color: var(--mark-text-violet); }

/* 右键菜单色点 */
.mark-swatch {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 3px;
  margin-right: 6px;
  vertical-align: -1px;
  border: 1px solid color-mix(in srgb, var(--text) 18%, transparent);
}

.mark-swatch-amber { background: var(--mark-highlight-amber); }
.mark-swatch-rose { background: var(--mark-highlight-rose); }
.mark-swatch-green { background: var(--mark-highlight-green); }
.mark-swatch-blue { background: var(--mark-highlight-blue); }
.mark-swatch-violet { background: var(--mark-highlight-violet); }
```

（5）`:root` 块内追加：

```css
  --mark-highlight-amber: rgba(255, 193, 7, 0.42);
  --mark-highlight-rose: rgba(244, 67, 54, 0.24);
  --mark-highlight-green: rgba(76, 175, 80, 0.30);
  --mark-highlight-blue: rgba(33, 150, 243, 0.24);
  --mark-highlight-violet: rgba(156, 39, 176, 0.22);
  --mark-text-amber: #b45309;
  --mark-text-rose: #dc2626;
  --mark-text-green: #15803d;
  --mark-text-blue: #1d4ed8;
  --mark-text-violet: #7c3aed;
```

`html[data-theme="dark"]` 块内追加：

```css
  --mark-highlight-amber: rgba(255, 193, 7, 0.30);
  --mark-highlight-rose: rgba(244, 67, 54, 0.26);
  --mark-highlight-green: rgba(76, 175, 80, 0.24);
  --mark-highlight-blue: rgba(33, 150, 243, 0.26);
  --mark-highlight-violet: rgba(186, 104, 200, 0.26);
  --mark-text-amber: #fbbf24;
  --mark-text-rose: #f87171;
  --mark-text-green: #4ade80;
  --mark-text-blue: #60a5fa;
  --mark-text-violet: #c084fc;
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/__tests__/text-panel.test.ts src/__tests__/style-contract.test.ts src/__tests__/theme.test.ts`
Expected: PASS

- [ ] **Step 5: 手动视觉验证说明**

此任务的完整视觉验证（① 镜像文字与光标逐字对齐；② 滚动时颜色跟随；③ 明暗主题切换颜色可辨；④ IME 拼字时无跳动）依赖 Task 7 的菜单来施加格式，统一推迟到 Task 7 Step 5 执行。本任务只跑 `npm run dev` 确认页面无报错、既有编辑行为不受影响。

- [ ] **Step 6: 提交**

```bash
git add src/components/TextPanel.vue src/styles.css src/__tests__/text-panel.test.ts src/__tests__/style-contract.test.ts
git commit -m "feat: 透明 textarea + 镜像渲染层（marks 可视化，排版契约测试守护）"
```

---

### Task 7: 右键菜单「格式」组 + i18n

**Files:**
- Modify: `src/components/TextPanel.vue`（imports、menuOptions、handleMenuSelect、新函数）
- Modify: `src/state/i18n.ts`（`UI_TEXT` zh/en 的 `common` 各加 13 个 key；`SHORTCUT_HELP` 不动——那是 Task 8）
- Test: `src/__tests__/text-panel.test.ts`（追加）

- [ ] **Step 1: 写失败测试**

`src/__tests__/text-panel.test.ts` 追加（置于 describe 内；顶部补 `import { vi } from "vitest"` 若尚未导入——文件已导入）：

```ts
  /** 注入 navigator.clipboard mock 并在结束后恢复——泄漏会破坏同文件里
   *  「无 async clipboard 时保留原生菜单」的既有用例。 */
  async function withClipboard(test: () => Promise<void> | void): Promise<void> {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { readText: vi.fn().mockResolvedValue("") },
    });
    try {
      await test();
    } finally {
      Reflect.deleteProperty(navigator, "clipboard");
    }
  }

  it("选中文本后右键出现「格式」组，点高亮色即施加", async () => {
    await withClipboard(async () => {
      const wrapper = mount(TextPanel, {
        props: { titleId: "workspace-title", title: "工作空间", lines: [{ text: "hello world", indent: 0 }] },
        global: { stubs: { Dropdown: menuDropdownStub, NDropdown: menuDropdownStub, NTooltip: tooltipStub } },
      });
      const textarea = wrapper.get("textarea").element;
      textarea.setSelectionRange(6, 11);
      await wrapper.get("textarea").trigger("contextmenu");
      expect(wrapper.find('[data-key="format"]').exists()).toBe(true);
      await wrapper.get('[data-key="format-highlight-amber"]').trigger("click");
      const update = wrapper.emitted("update")?.at(-1)?.[0] as LineItem[];
      expect(update[0].marks).toEqual([{ type: "highlight", start: 6, end: 11, color: "amber" }]);
      // 再点同色 → toggle 取消
      textarea.setSelectionRange(6, 11);
      await wrapper.get("textarea").trigger("contextmenu");
      await wrapper.get('[data-key="format-highlight-amber"]').trigger("click");
      const toggled = wrapper.emitted("update")?.at(-1)?.[0] as LineItem[];
      expect(toggled[0].marks).toBeUndefined();
    });
  });

  it("无选区时不出现「格式」组", async () => {
    await withClipboard(async () => {
      const wrapper = mount(TextPanel, {
        props: { titleId: "workspace-title", title: "工作空间", lines: [{ text: "hello", indent: 0 }] },
        global: { stubs: { Dropdown: menuDropdownStub, NDropdown: menuDropdownStub, NTooltip: tooltipStub } },
      });
      await wrapper.get("textarea").trigger("contextmenu");
      expect(wrapper.find('[data-key="format"]').exists()).toBe(false);
    });
  });

  it("跨行选区中划线按行拆段，清除全部格式可一键移除", async () => {
    await withClipboard(async () => {
      const wrapper = mount(TextPanel, {
        props: { titleId: "workspace-title", title: "工作空间", lines: [{ text: "ab", indent: 0 }, { text: "cd", indent: 0 }] },
        global: { stubs: { Dropdown: menuDropdownStub, NDropdown: menuDropdownStub, NTooltip: tooltipStub } },
      });
      const textarea = wrapper.get("textarea").element;
      textarea.setSelectionRange(1, 4);
      await wrapper.get("textarea").trigger("contextmenu");
      await wrapper.get('[data-key="format-strike"]').trigger("click");
      const update = wrapper.emitted("update")?.at(-1)?.[0] as LineItem[];
      expect(update[0].marks).toEqual([{ type: "strike", start: 1, end: 2 }]);
      expect(update[1].marks).toEqual([{ type: "strike", start: 0, end: 2 }]);
      textarea.setSelectionRange(0, 5);
      await wrapper.get("textarea").trigger("contextmenu");
      await wrapper.get('[data-key="format-clear-all"]').trigger("click");
      const cleared = wrapper.emitted("update")?.at(-1)?.[0] as LineItem[];
      expect(cleared[0].marks).toBeUndefined();
      expect(cleared[1].marks).toBeUndefined();
    });
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/__tests__/text-panel.test.ts`
Expected: FAIL（`[data-key="format"]` 不存在）

- [ ] **Step 3: 实现**

3a. `TextPanel.vue` import 区补充：

```ts
import { Highlighter, Paintbrush, Palette, RemoveFormatting, Strikethrough, Underline } from "lucide-vue-next";
```

textMarks import 行扩为：

```ts
import { clearMarksInRange, MARK_COLORS, toggleMarkInRange } from "../utils/textMarks";
```

（`translateMarksForEdit` 保留在既有 import。）types import 补 `MarkColor`。

3b. `menuOptions`（101-124 行）—— 在 `if (props.polish && menu.value?.selectionText) {...}` 块之后、`if (menu.value?.selectionText) { delete ... }` 之前插入：

```ts
    if (menu.value?.selectionText) {
      options.push({
        label: uiText.value.common.format,
        key: "format",
        icon: renderIcon(Paintbrush),
        children: [
          {
            label: uiText.value.common.highlight,
            key: "format-highlight",
            icon: renderIcon(Highlighter),
            children: buildColorSubmenu("highlight"),
          },
          {
            label: uiText.value.common.textColor,
            key: "format-color",
            icon: renderIcon(Palette),
            children: buildColorSubmenu("color"),
          },
          { label: uiText.value.common.strike, key: "format-strike", icon: renderIcon(Strikethrough) },
          { label: uiText.value.common.underline, key: "format-underline", icon: renderIcon(Underline) },
          { type: "divider", key: "format-divider" },
          { label: uiText.value.common.clearAllMarks, key: "format-clear-all", icon: renderIcon(RemoveFormatting) },
        ],
      });
    }
```

3c. script 新增（放在 `menuOptions` 之前）：

```ts
const MARK_COLOR_LABEL_KEYS = {
  amber: "markColorAmber",
  rose: "markColorRose",
  green: "markColorGreen",
  blue: "markColorBlue",
  violet: "markColorViolet",
} as const;

/** 「高亮 / 文字颜色」共用的色板子菜单：5 色 + 清除项。色点用 icon 槽渲染，label 保持纯字符串。 */
function buildColorSubmenu(type: "highlight" | "color"): DropdownOption[] {
  return [
    ...MARK_COLORS.map((color) => ({
      label: uiText.value.common[MARK_COLOR_LABEL_KEYS[color]],
      key: `format-${type}-${color}`,
      icon: () => h("span", { class: `mark-swatch mark-swatch-${color}` }),
    })),
    { type: "divider", key: `format-${type}-divider` },
    {
      label: type === "highlight" ? uiText.value.common.clearHighlight : uiText.value.common.defaultColor,
      key: `format-${type}-clear`,
    },
  ];
}

function parseMarkColor(value: string): MarkColor | null {
  return (MARK_COLORS as readonly string[]).includes(value) ? (value as MarkColor) : null;
}

/** 格式变更的统一落点：入撤销栈 → 换 marks → 上报。文本不动。 */
function applyMarkChange(next: TextMark[]): void {
  undoStack.value = [...undoStack.value.slice(-49), lastUndoState.value];
  editorMarks.value = next;
  lastUndoState.value = { text: committedText.value, marks: [...next] };
  emit("update", linesFromEditorState(text.value, next));
}

/** 右键「格式」组：toggle 施加/取消选区格式；父级 key（自身带子菜单）忽略。 */
function applyFormatFromMenu(key: string, target: HTMLTextAreaElement): void {
  if (key === "format" || key === "format-highlight" || key === "format-color") return;
  const range = getTextSelectionRange(target);
  if (range.start === range.end) return;
  if (!editing.value || target.readOnly) startEditingFromTextarea(target);
  const textValue = text.value;
  if (key === "format-clear-all") {
    applyMarkChange(clearMarksInRange(editorMarks.value, range));
    return;
  }
  if (key === "format-highlight-clear") {
    applyMarkChange(clearMarksInRange(editorMarks.value, range, "highlight"));
    return;
  }
  if (key === "format-color-clear") {
    applyMarkChange(clearMarksInRange(editorMarks.value, range, "color"));
    return;
  }
  if (key === "format-strike") {
    applyMarkChange(toggleMarkInRange(textValue, editorMarks.value, range, "strike"));
    return;
  }
  if (key === "format-underline") {
    applyMarkChange(toggleMarkInRange(textValue, editorMarks.value, range, "underline"));
    return;
  }
  const highlightColor = key.startsWith("format-highlight-") ? parseMarkColor(key.slice("format-highlight-".length)) : null;
  if (highlightColor) {
    applyMarkChange(toggleMarkInRange(textValue, editorMarks.value, range, "highlight", highlightColor));
    return;
  }
  const textColor = key.startsWith("format-color-") ? parseMarkColor(key.slice("format-color-".length)) : null;
  if (textColor) {
    applyMarkChange(toggleMarkInRange(textValue, editorMarks.value, range, "color", textColor));
  }
}
```

3d. `handleMenuSelect`（479-512 行）—— 在 `if (key === "delete" && target)` 之前插入：

```ts
  if (key.startsWith("format-") && target) {
    applyFormatFromMenu(key, target);
    return;
  }
```

3e. `src/state/i18n.ts` —— zh `common`（440-461 行块内）追加：

```ts
      format: "格式",
      highlight: "高亮",
      textColor: "文字颜色",
      strike: "中划线",
      underline: "下划线",
      clearHighlight: "清除高亮",
      defaultColor: "恢复默认",
      clearAllMarks: "清除全部格式",
      markColorAmber: "琥珀",
      markColorRose: "玫红",
      markColorGreen: "翠绿",
      markColorBlue: "天蓝",
      markColorViolet: "紫罗兰",
```

en `common`（808 行块内）追加：

```ts
      format: "Format",
      highlight: "Highlight",
      textColor: "Text color",
      strike: "Strikethrough",
      underline: "Underline",
      clearHighlight: "Clear highlight",
      defaultColor: "Default color",
      clearAllMarks: "Clear all formatting",
      markColorAmber: "Amber",
      markColorRose: "Rose",
      markColorGreen: "Green",
      markColorBlue: "Blue",
      markColorViolet: "Violet",
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/__tests__/text-panel.test.ts src/__tests__/i18n.test.ts src/__tests__/messages.test.ts src/__tests__/context-menu.test.ts`
Expected: PASS

- [ ] **Step 5: 手动视觉验证（补 Task 6 Step 5 的完整流程）**

Run: `npm run dev`，完成 Task 6 Step 5 列的四项检查（对齐/滚动/主题/IME），另验证：菜单色点颜色与实际高亮一致、子菜单层级展开正常、toggle 再按取消。

- [ ] **Step 6: 提交**

```bash
git add src/components/TextPanel.vue src/state/i18n.ts src/__tests__/text-panel.test.ts
git commit -m "feat: 便签右键「格式」菜单（高亮/文字颜色/中划线/下划线/清除）"
```

---

### Task 8: 键盘快捷键 + 快捷键帮助

**Files:**
- Modify: `src/components/TextPanel.vue`（`handleKeydown` + 新函数）
- Modify: `src/state/i18n.ts`（`SHORTCUT_HELP` zh 1292-1302 行块 / en 1349-1359 行块）
- Test: `src/__tests__/text-panel.test.ts`（追加）

- [ ] **Step 1: 写失败测试**

`src/__tests__/text-panel.test.ts` 追加：

```ts
  it("Ctrl+Shift+H 给选中文字上默认琥珀高亮，重复按取消", async () => {
    const wrapper = mount(TextPanel, {
      props: { titleId: "workspace-title", title: "工作空间", lines: [{ text: "hello world", indent: 0 }] },
    });
    const textarea = wrapper.get("textarea").element;
    await wrapper.get("textarea").trigger("dblclick");
    textarea.setSelectionRange(0, 5);
    await wrapper.get("textarea").trigger("keydown", { key: "h", ctrlKey: true, shiftKey: true });
    let update = wrapper.emitted("update")?.at(-1)?.[0] as LineItem[];
    expect(update[0].marks).toEqual([{ type: "highlight", start: 0, end: 5, color: "amber" }]);
    textarea.setSelectionRange(0, 5);
    await wrapper.get("textarea").trigger("keydown", { key: "h", ctrlKey: true, shiftKey: true });
    update = wrapper.emitted("update")?.at(-1)?.[0] as LineItem[];
    expect(update[0].marks).toBeUndefined();
  });

  it("Ctrl+Shift+X 中划线；IME 拼字期间不触发", async () => {
    const wrapper = mount(TextPanel, {
      props: { titleId: "workspace-title", title: "工作空间", lines: [{ text: "hello", indent: 0 }] },
    });
    const textarea = wrapper.get("textarea").element;
    await wrapper.get("textarea").trigger("dblclick");
    textarea.setSelectionRange(0, 5);
    await wrapper.get("textarea").trigger("keydown", { key: "x", ctrlKey: true, shiftKey: true });
    const update = wrapper.emitted("update")?.at(-1)?.[0] as LineItem[];
    expect(update[0].marks).toEqual([{ type: "strike", start: 0, end: 5 }]);
    textarea.setSelectionRange(0, 5);
    await wrapper.get("textarea").trigger("keydown", { key: "h", ctrlKey: true, shiftKey: true, isComposing: true });
    expect(wrapper.emitted("update")?.length).toBe(1);
  });

  it("无选区时快捷键静默不动作", async () => {
    const wrapper = mount(TextPanel, {
      props: { titleId: "workspace-title", title: "工作空间", lines: [{ text: "hello", indent: 0 }] },
    });
    await wrapper.get("textarea").trigger("dblclick");
    await wrapper.get("textarea").trigger("keydown", { key: "h", ctrlKey: true, shiftKey: true });
    expect(wrapper.emitted("update")).toBeUndefined();
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/__tests__/text-panel.test.ts`
Expected: FAIL（快捷键无动作）

- [ ] **Step 3: 实现**

3a. `handleKeydown`（153-188 行）—— 在 `if (isImeComposing(event)) return;`（157 行）之后、Ctrl+Z 分支之前插入：

```ts
  const formatShortcut = getFormatShortcut(event);
  if (formatShortcut) {
    event.preventDefault();
    applyFormatShortcut(textarea, formatShortcut);
    return;
  }
```

3b. script 新增：

```ts
interface FormatShortcut {
  type: TextMark["type"];
  color?: MarkColor;
}

function getFormatShortcut(event: KeyboardEvent): FormatShortcut | null {
  if (!event.shiftKey || !(event.ctrlKey || event.metaKey) || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (key === "h") return { type: "highlight", color: "amber" };
  if (key === "x") return { type: "strike" };
  if (key === "u") return { type: "underline" };
  return null;
}

/** 快捷键格式化：要求非空选区，无选区静默不动作（与菜单口径一致）。 */
function applyFormatShortcut(textarea: HTMLTextAreaElement, shortcut: FormatShortcut): void {
  const range = getTextSelectionRange(textarea);
  if (range.start === range.end) return;
  applyMarkChange(toggleMarkInRange(text.value, editorMarks.value, range, shortcut.type, shortcut.color));
}
```

3c. `src/state/i18n.ts` `SHORTCUT_HELP` zh 块（1292-1302 行）—— tips 末尾追加一行，shortcuts 在 `Ctrl/⌘ + ↑/↓` 之后插入三条：

```ts
      "选中文字后右键「格式」可以加高亮、文字颜色、中划线等标注。",
```

```ts
      { key: "Ctrl/⌘ + Shift + H", desc: "高亮选中文字（重复按取消）" },
      { key: "Ctrl/⌘ + Shift + X", desc: "给选中文字加中划线" },
      { key: "Ctrl/⌘ + Shift + U", desc: "给选中文字加下划线" },
```

en 块（1349-1359 行）同样处理：

```ts
      "Select text and right-click \"Format\" to add highlight, text color, or strikethrough.",
```

```ts
      { key: "Ctrl/⌘ + Shift + H", desc: "Highlight the selection (press again to clear)" },
      { key: "Ctrl/⌘ + Shift + X", desc: "Strikethrough the selection" },
      { key: "Ctrl/⌘ + Shift + U", desc: "Underline the selection" },
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/__tests__/text-panel.test.ts src/__tests__/shortcut-help.test.ts src/__tests__/guide-tips.test.ts`
Expected: PASS（shortcut-help 断言的是 contains 语义，新增条目不破坏既有断言）

- [ ] **Step 5: 提交**

```bash
git add src/components/TextPanel.vue src/state/i18n.ts src/__tests__/text-panel.test.ts
git commit -m "feat: 便签格式快捷键（Shift+H 高亮 / Shift+X 中划线 / Shift+U 下划线）"
```

---

### Task 9: CLAUDE.md 修正 + 全量回归

**Files:**
- Modify: `CLAUDE.md`（「Line Editors (ws-editor)」一节，53-55 行附近）

- [ ] **Step 1: 修正 CLAUDE.md**

将「Line Editors (`ws-editor`)」一节整体替换为：

```markdown
### Line Editors

The notes area (`SpacePanel.vue` space tabs) shares a single `TextPanel.vue` whose editor is one native `<textarea>` (plain text, `\n`-separated lines, 4-space indent via `INDENT_UNIT` in `src/utils/textEditor.ts`). Tab/Shift+Tab indents, Enter continues list markers, Cmd+arrows move/jump lines, and `renumberOrderedListText` rewrites ordered-list prefixes on every input.

Rich-text annotations (highlight / strikethrough / underline / text color) are stored as per-line `LineItem.marks` metadata (`src/utils/textMarks.ts`) — the textarea text itself stays plain. The textarea's text is transparent; a typography-paired mirror layer (`.text-mirror` in `TextPanel.vue`) renders the same text with styled spans behind it and syncs `scrollTop`. All text mutations translate mark offsets through `translateMarksForEdit` (line prefix/suffix alignment + per-line diff), which typing, paste, IME, AI-polish replacement, undo, and renumber all share. Apply formats via the selection right-click「格式」menu or Ctrl/Cmd+Shift+H/X/U. The shared typography CSS rule MUST keep `.text-editor-textarea` and `.text-mirror` selectors paired (guarded by `style-contract.test.ts`).
```

- [ ] **Step 2: 全量回归**

Run: `npm test`
Expected: 全绿（两个已知既有噪音：结尾 `Errors 1`（app-render 的 IndexedDB stub）与「输码验证 unknown/revoked」偶发，重跑一次确认非本改动引入）

Run: `npm run build`
Expected: 构建成功，无 TS 错误

- [ ] **Step 3: 真机验收（`npm run preview`，SW 离线行为与生产包验证的唯一途径）**

打开生产包，重复 Task 6/7 的四项视觉检查；刷新页面确认 marks 从 localStorage 恢复；Ctrl+S 显式保存后刷新仍恢复；切换明暗主题颜色可辨。

- [ ] **Step 4: 提交**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md 行编辑器一节改写为 TextPanel textarea + 镜像层现状"
```

---

## 任务依赖

Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6 → Task 7 → Task 8 → Task 9（严格顺序；每任务独立提交，失败可单独回滚）。

## 完成定义

- spec 的全部测试清单（spec「测试」一节 8 条）都有对应落点：1→Task 1、2→Task 3、3+4→Task 4、5→Task 2/7、6→Task 7、7→Task 6（CSS 契约）、8→Task 8。
- `npm test` 与 `npm run build` 全绿；`npm run preview` 手动验收四项视觉检查通过。
