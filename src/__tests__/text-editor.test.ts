import { describe, expect, it } from "vitest";
import { handleTextareaTab, renumberOrderedListText } from "../utils/textEditor";

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

  it("does not convert a numbered line when the caret is inside its text", () => {
    const result = apply("1. 任务", 4);
    expect(result.value).toBe("    1. 任务");
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
});

describe("handleTextareaTab — preserved indent/outdent behavior", () => {
  it("still indents when the caret is not at the start of a plain line", () => {
    const result = apply("买牛奶", 2);
    expect(result.value).toBe("    买牛奶");
  });

  it("still indents a multi-line selection", () => {
    const textarea = textareaWith("第一行\n第二行", 0);
    textarea.setSelectionRange(0, textarea.value.length);
    handleTextareaTab(textarea, false);
    expect(textarea.value).toBe("    第一行\n    第二行");
  });
});
