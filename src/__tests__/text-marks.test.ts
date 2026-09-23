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
    expect(normalizeMarkList([{ type: "highlight", start: 5, end: 20, color: "amber" }], 10)).toEqual([hl(5, 10)]);
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
