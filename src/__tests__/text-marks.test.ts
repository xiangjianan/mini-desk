import { describe, expect, it } from "vitest";
import {
  buildMirrorSegments,
  clearMarksInRange,
  mergeMarkList,
  normalizeMarkList,
  toggleMarkInRange,
  translateMarksForEdit,
} from "../utils/textMarks";
import { editorStateFromLines, linesFromEditorState } from "../utils/textEditor";
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

  it("替换紧贴 mark 末尾的字符：新字符延续高亮（粘性末端，锁定既有语义）", () => {
    expect(translateMarksForEdit([hl(0, 2)], "ABC", "ABD")).toEqual([hl(0, 3)]);
  });
});

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

  it("选区含尾随换行且其余已全覆盖：可一次取消（尾部换行豁免）", () => {
    const marks: TextMark[] = [{ type: "strike", start: 0, end: 2 }];
    expect(toggleMarkInRange("ab\n", marks, { start: 0, end: 3 }, "strike")).toEqual([]);
  });

  it("选区从行首缩进开始：施加后经行存储往返仍可一次取消（缩进位豁免）", () => {
    const text = "第一行\n    第二行\n第三行";
    // 选区从第二行行首（含 4 空格缩进）选到第三行行尾
    const range = { start: 4, end: text.length };
    const applied = toggleMarkInRange(text, [], range, "highlight", "amber");
    // 模拟生产往返：全文 marks → 行内（缩进被裁到内容起点）→ 父层存储 → 回声全文
    const roundtrip = editorStateFromLines(linesFromEditorState(text, applied)).marks;
    // 往返后 marks 从内容起点（8 = 行首 4 + 缩进 4）开始，选区起点 4 仍落在缩进里——缩进位不算覆盖缺口
    expect(roundtrip[0].start).toBe(8);
    expect(toggleMarkInRange(text, roundtrip, range, "highlight", "amber")).toEqual([]);
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
      { chunk: "cd", highlight: "amber" },
      { chunk: "e", highlight: "amber", strike: true },
      { chunk: "f", strike: true },
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
