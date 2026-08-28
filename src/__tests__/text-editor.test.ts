import { describe, expect, it } from "vitest";
import { handleTextareaTab, moveCaretToLineBoundary, moveTextareaLine, renumberOrderedListText } from "../utils/textEditor";

function textareaWith(value: string, caret: number): HTMLTextAreaElement {
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setSelectionRange(caret, caret);
  return textarea;
}

function apply(value: string, caret: number, shift = false): { value: string; caret: number } {
  const textarea = textareaWith(value, caret);
  handleTextareaTab(textarea, shift);
  return { value: textarea.value, caret: textarea.selectionStart };
}

// handleTextareaTab returns the text before the editor's separate renumber pass
// (run by the panel). renumbered() applies that pass so tests can assert the
// final, user-visible result for the numbered-conversion cases.
const renumbered = renumberOrderedListText;

describe("handleTextareaTab — Tab turns a line into an indented bullet", () => {
  it("indents and bulletizes a plain root-level line at the line head", () => {
    const result = apply("买牛奶", 0);
    expect(result.value).toBe("    - 买牛奶");
    expect(result.caret).toBe(6);
  });

  it("indents and bulletizes an empty line", () => {
    const result = apply("", 0);
    expect(result.value).toBe("    - ");
    expect(result.caret).toBe(6);
  });

  it("replaces a numbered marker with '- ' when Tab is pressed on the marker", () => {
    const result = apply("1. 第一项", 0);
    expect(result.value).toBe("    - 第一项");
    expect(result.caret).toBe(6);
  });

  it("converts a numbered marker right after Enter (caret right after the marker)", () => {
    // "1. 任务一\n2. " — caret sits right after the "2. " continuation marker.
    const result = apply("1. 任务一\n2. ", 10);
    expect(result.value).toBe("1. 任务一\n    - ");
    expect(result.caret).toBe(13);
  });

  it("converts a middle numbered item to a bullet and renumbers the rest", () => {
    // Tab on line 2's "2." -> bullet; line 3's "3." renumbers to "2.".
    const result = apply("1. 第一\n2. 第二\n3. 第三", 6);
    expect(result.value).toBe("1. 第一\n    - 第二\n3. 第三");
    expect(renumbered(result.value)).toBe("1. 第一\n    - 第二\n2. 第三");
  });

  it("syncs a numbered line to a bullet on Tab even with the caret in the text", () => {
    // No level-1 sibling above -> default bullet, regardless of caret position.
    const result = apply("1. 任务", 4);
    expect(result.value).toBe("    - 任务");
  });

  it("does not double-bullet a line that already starts with '- '", () => {
    const result = apply("- 已是短横线", 0);
    expect(result.value).toBe("    - 已是短横线");
  });
});

describe("handleTextareaTab — Shift+Tab outdents a bullet line", () => {
  it("removes the bullet at the root (plain context) and keeps the caret in the text", () => {
    // Caret between 买 and 牛 (offset 1 inside the item text).
    const result = apply("备注\n    - 买牛奶", 10, true);
    expect(result.value).toBe("备注\n买牛奶");
    expect(result.caret).toBe(4);
  });

  it("keeps the bullet when the line is still nested (just outdents)", () => {
    // indent 8 -> indent 4, bullet preserved, caret stays between 买 and 牛.
    const result = apply("备注\n        - 买牛奶", 14, true);
    expect(result.value).toBe("备注\n    - 买牛奶");
    expect(result.caret).toBe(10);
  });

  it("removes a root-level bullet when the previous line is not numbered", () => {
    const result = apply("备注\n- 子", 5, true);
    expect(result.value).toBe("备注\n子");
  });

  it("converts the bullet back to a numbered marker at the root in a numbered list", () => {
    const result = apply("1. 第一\n    - 第二", 13, true);
    expect(result.value).toBe("1. 第一\n1. 第二");
    expect(renumbered(result.value)).toBe("1. 第一\n2. 第二");
    expect(result.caret).toBe(10);
  });

  it("outdenting a converted bullet restores the full numbered sequence", () => {
    // After Tab made line 2 a bullet, Shift+Tab turns it back into "2." and the
    // list renumbers to 1, 2, 3.
    const result = apply("1. 第一\n    - 第二\n2. 第三", 13, true);
    expect(result.value).toBe("1. 第一\n1. 第二\n2. 第三");
    expect(renumbered(result.value)).toBe("1. 第一\n2. 第二\n3. 第三");
  });

  it("places the caret after the marker when it was on the marker/indent", () => {
    // Caret at the line head (on the indent) -> lands right after "- " is gone.
    const result = apply("备注\n    - 买牛奶", 3, true);
    expect(result.value).toBe("备注\n买牛奶");
    expect(result.caret).toBe(3);
  });

  it("outdents normally on a non-bullet line", () => {
    const result = apply("    缩进行", 0, true);
    expect(result.value).toBe("缩进行");
  });

  it("outdenting a nested bullet back to the root rejoins the numbered list above", () => {
    // Two nested bullets sit under "1. 第一". Outdenting the empty second bullet
    // to the root should rejoin the numbered list (-> "2."), not drop the marker.
    const result = apply("1. 第一\n    - 第二\n    - ", 21, true);
    expect(result.value).toBe("1. 第一\n    - 第二\n1. ");
    expect(renumbered(result.value)).toBe("1. 第一\n    - 第二\n2. ");
    expect(result.caret).toBe(18);
  });

  it("outdenting a nested bullet with text rejoins the numbered list above", () => {
    const result = apply("1. 第一\n    - 第二\n    - 第三", 23, true);
    expect(result.value).toBe("1. 第一\n    - 第二\n1. 第三");
    expect(renumbered(result.value)).toBe("1. 第一\n    - 第二\n2. 第三");
  });
});

describe("handleTextareaTab — marker follows the nearest same-level sibling", () => {
  it("indents a plain line into a numbered level as a numbered item", () => {
    // "c" indents under the level-1 numbered line "    1. b".
    const result = apply("1. a\n    1. b\nc", 14);
    expect(result.value).toBe("1. a\n    1. b\n    1. c");
    expect(renumbered(result.value)).toBe("1. a\n    1. b\n    2. c");
  });

  it("indents a plain line into a bullet level as a bullet", () => {
    // "c" indents under the level-1 bullet line "    - b".
    const result = apply("- a\n    - b\nc", 12);
    expect(result.value).toBe("- a\n    - b\n    - c");
  });

  it("inherits the numbered sibling marker with the caret mid-line", () => {
    // 光标落在 "ccc" 文本中间（非行首）：上一行有标记且目标层级存在同级
    // 兄弟时，Tab 同样继承编号标记，而不是退回默认短横线。
    const result = apply("1. a\n    1. b\nccc", 15);
    expect(result.value).toBe("1. a\n    1. b\n    1. ccc");
    expect(renumbered(result.value)).toBe("1. a\n    1. b\n    2. ccc");
  });

  it("inherits the bullet sibling marker with the caret mid-line", () => {
    const result = apply("- a\n    - b\nccc", 13);
    expect(result.value).toBe("- a\n    - b\n    - ccc");
  });

  it("outdents a nested bullet into a numbered level as a numbered item", () => {
    // "        - c" outdents to level 1, whose nearest sibling "    1. b" is numbered.
    const result = apply("1. a\n    1. b\n        - c", 23, true);
    expect(result.value).toBe("1. a\n    1. b\n    1. c");
    expect(renumbered(result.value)).toBe("1. a\n    1. b\n    2. c");
  });

  it("outdents a nested bullet into a bullet level keeping the bullet", () => {
    // "        - c" outdents to level 1, whose nearest sibling "    - b" is a bullet.
    const result = apply("- a\n    - b\n        - c", 22, true);
    expect(result.value).toBe("- a\n    - b\n    - c");
  });

  it("indents a numbered line under a dash sibling into a dash", () => {
    // "1. c" (caret in its text) indents to level 1, whose nearest sibling "    - b" is a dash.
    const result = apply("- a\n    - b\n1. c", 15);
    expect(result.value).toBe("- a\n    - b\n    - c");
  });

  it("outdents a numbered line under a dash sibling into a dash", () => {
    // "    1. b" outdents to the root, whose nearest sibling "- a" is a dash.
    const result = apply("- a\n    1. b", 11, true);
    expect(result.value).toBe("- a\n- b");
  });
});

describe("handleTextareaTab — preserved indent/outdent behavior", () => {
  it("indents and bulletizes a plain line even with the caret in the text", () => {
    const result = apply("买牛奶", 2);
    expect(result.value).toBe("    - 买牛奶");
  });

  it("still indents a multi-line selection", () => {
    const textarea = textareaWith("第一行\n第二行", 0);
    textarea.setSelectionRange(0, textarea.value.length);
    handleTextareaTab(textarea, false);
    expect(textarea.value).toBe("    第一行\n    第二行");
  });
});

describe("handleTextareaTab — Tab 短横线跟随紧邻上一行", () => {
  it("上一行无标记（光标在行中）→ 缩进 + 短横线", () => {
    const result = apply("购物清单\n买牛奶", 8);
    expect(result.value).toBe("购物清单\n    - 买牛奶");
  });

  it("上一行是空行 → 缩进 + 短横线", () => {
    const result = apply("备注\n\n买牛奶", 4);
    expect(result.value).toBe("备注\n\n    - 买牛奶");
  });

  it("首行（没有上一行）→ 缩进 + 短横线", () => {
    const result = apply("买牛奶", 3);
    expect(result.value).toBe("    - 买牛奶");
  });

  it("已有缩进的普通行，上一行无标记 → 再加一级缩进 + 短横线", () => {
    const result = apply("备注\n    买牛奶", 7);
    expect(result.value).toBe("备注\n        - 买牛奶");
  });

  it("上一行有标记但目标层级无同级兄弟 → 默认短横线（不再依赖光标位置）", () => {
    const result = apply("1. a\nb", 5);
    expect(result.value).toBe("1. a\n    - b");
  });
});

describe("moveCaretToLineBoundary — Cmd/Ctrl+Arrow line start/end", () => {
  function move(value: string, caret: number, edge: "start" | "end"): { value: string; caret: number } {
    const textarea = textareaWith(value, caret);
    const next = moveCaretToLineBoundary(textarea, edge);
    return { value: textarea.value, caret: next };
  }

  it("jumps a plain line to its head on 'start'", () => {
    const result = move("买牛奶", 2, "start");
    expect(result.caret).toBe(0);
    expect(result.value).toBe("买牛奶");
  });

  it("jumps a plain line to its end on 'end'", () => {
    const result = move("买牛奶\n第二行", 2, "end");
    // "买牛奶" is 3 chars; caret at 2 -> end of that line is index 3.
    expect(result.caret).toBe(3);
  });

  it("lands just after a numbered marker ('1. ') on 'start'", () => {
    // "1. 第一项": marker "1. " is 3 chars; text "第一项" starts at index 3.
    const result = move("1. 第一项", 5, "start");
    expect(result.caret).toBe(3);
  });

  it("on a second press collapses to the absolute line head", () => {
    // Caret already at the text start (3) -> falls back to the line head (0).
    const result = move("1. 第一项", 3, "start");
    expect(result.caret).toBe(0);
  });

  it("stays at the line head when already there", () => {
    const result = move("1. 第一项", 0, "start");
    expect(result.caret).toBe(0);
  });

  it("lands just after a dash marker ('- ') on 'start'", () => {
    // "- 买牛奶": marker "- " is 2 chars; text starts at index 2.
    const result = move("- 买牛奶", 4, "start");
    expect(result.caret).toBe(2);
  });

  it("on a second press collapses past a dash marker to the line head", () => {
    const result = move("- 买牛奶", 2, "start");
    expect(result.caret).toBe(0);
  });

  it("accounts for indentation before a numbered marker", () => {
    // 4-space indent + "1. " (3) -> text start at index 7.
    const result = move("    1. text", 8, "start");
    expect(result.caret).toBe(7);
  });

  it("accounts for indentation before a dash marker", () => {
    // 4-space indent + "- " (2) -> text start at index 6.
    const result = move("    - text", 8, "start");
    expect(result.caret).toBe(6);
  });

  it("jumps to the end of a numbered line on 'end'", () => {
    // "1. 第一项" length is 6.
    const result = move("1. 第一项", 3, "end");
    expect(result.caret).toBe(6);
  });

  it("targets the correct line in multi-line text", () => {
    // Line 2 "1. 第二" starts at index 3 ("第一\n"); its text start is index 6.
    const result = move("第一\n1. 第二\n第三", 7, "start");
    expect(result.caret).toBe(6);
  });

  it("collapses a selection to the start edge", () => {
    const textarea = textareaWith("1. 第一项", 0);
    textarea.setSelectionRange(2, 5);
    const next = moveCaretToLineBoundary(textarea, "start");
    expect(next).toBe(0);
    expect(textarea.selectionStart).toBe(0);
    expect(textarea.selectionEnd).toBe(0);
  });

  it("collapses a selection to the end edge", () => {
    const textarea = textareaWith("1. 第一项", 0);
    textarea.setSelectionRange(2, 5);
    const next = moveCaretToLineBoundary(textarea, "end");
    expect(next).toBe(6);
    expect(textarea.selectionStart).toBe(6);
    expect(textarea.selectionEnd).toBe(6);
  });
});

describe("moveTextareaLine — Ctrl/Cmd+↑/↓ 移动当前行", () => {
  function move(value: string, caret: number, direction: -1 | 1): { value: string; caret: number } {
    const textarea = textareaWith(value, caret);
    moveTextareaLine(textarea, direction);
    return { value: textarea.value, caret: textarea.selectionStart };
  }

  it("上移普通行：整行交换，光标跟随移动后的行", () => {
    // 光标在第二行行中（"第二" 的两个字之间）。
    const result = move("第一\n第二", 4, -1);
    expect(result.value).toBe("第二\n第一");
    expect(result.caret).toBe(1);
  });

  it("下移普通行：整行交换，光标跟随移动后的行", () => {
    const result = move("第一\n第二", 1, 1);
    expect(result.value).toBe("第二\n第一");
    expect(result.caret).toBe(4);
  });

  it("首行上移返回 undefined 且不改动内容", () => {
    const textarea = textareaWith("第一\n第二", 0);
    expect(moveTextareaLine(textarea, -1)).toBeUndefined();
    expect(textarea.value).toBe("第一\n第二");
  });

  it("末行下移返回 undefined 且不改动内容", () => {
    const textarea = textareaWith("第一\n第二", 5);
    expect(moveTextareaLine(textarea, 1)).toBeUndefined();
    expect(textarea.value).toBe("第一\n第二");
  });

  it("上移有序列表项：编号留在原位，仅交换条目文本", () => {
    // 光标在 "2. b" 行尾；上移后该行文本占据 "1. " 槽位，编号依然连续。
    const result = move("1. a\n2. b\n3. c", 9, -1);
    expect(result.value).toBe("1. b\n2. a\n3. c");
    expect(result.caret).toBe(4);
    expect(renumbered(result.value)).toBe(result.value);
  });

  it("下移有序列表项同样保持编号连续", () => {
    // 光标在 "1. a" 行尾；下移后 "a" 占据第二个槽位，光标落在 "2. a" 行尾。
    const result = move("1. a\n2. b\n3. c", 4, 1);
    expect(result.value).toBe("1. b\n2. a\n3. c");
    expect(result.caret).toBe(9);
  });

  it("位数不同的编号（9. 与 10.）交换后光标仍落在文本末尾", () => {
    // 光标在 "10. j" 行尾；上移后文本 "j" 落在 "9. " 之后。
    const result = move("9. i\n10. j", 10, -1);
    expect(result.value).toBe("9. j\n10. i");
    expect(result.caret).toBe(4);
  });

  it("同级短横线行上移：短横线保留，文本交换", () => {
    // 光标在 "- 乙" 行尾。
    const result = move("- 甲\n- 乙", 7, -1);
    expect(result.value).toBe("- 乙\n- 甲");
    expect(result.caret).toBe(3);
  });

  it("短横线行与编号行互换：整行交换，各自保留标记", () => {
    // 光标在 "- b" 行尾；整行上移后短横线仍是短横线、编号仍是编号。
    const result = move("1. a\n- b", 8, -1);
    expect(result.value).toBe("- b\n1. a");
    expect(result.caret).toBe(3);
  });

  it("不同缩进层级的行整行交换，缩进随行走", () => {
    // 光标在 "    - b" 行尾。
    const result = move("- a\n    - b", 11, -1);
    expect(result.value).toBe("    - b\n- a");
    expect(result.caret).toBe(7);
  });

  it("空行下移与相邻行整行交换", () => {
    const result = move("\na\nb", 0, 1);
    expect(result.value).toBe("a\n\nb");
    expect(result.caret).toBe(2);
  });

  it("连续下移把行一路移到末尾，光标跟随不来回振荡", () => {
    const textarea = textareaWith("a\nb\nc", 1);
    moveTextareaLine(textarea, 1);
    expect(textarea.value).toBe("b\na\nc");
    moveTextareaLine(textarea, 1);
    expect(textarea.value).toBe("b\nc\na");
    expect(textarea.selectionStart).toBe(5);
  });

  it("存在选区时折叠到选区起点所在行并移动", () => {
    // 选中整行 "2. b"（5..9）；移动的是起点所在的第二行。
    const textarea = textareaWith("1. a\n2. b", 5);
    textarea.setSelectionRange(5, 9);
    moveTextareaLine(textarea, -1);
    expect(textarea.value).toBe("1. b\n2. a");
    expect(textarea.selectionStart).toBe(3);
    expect(textarea.selectionEnd).toBe(3);
  });
});
