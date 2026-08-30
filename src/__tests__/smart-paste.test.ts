import { afterEach, describe, expect, it, vi } from "vitest";
import { runSelectionPolish, runSmartPaste, selectionPolishMessages, smartPasteMessages } from "../utils/smartPaste";
import type { PolishResult } from "../sync/polishClient";

const MESSAGES = smartPasteMessages(
  {
    app: {
      polishWorking: "整理中",
      polishTodoDone: "已整理为 {count} 条提醒",
      polishNoteDone: "已排版为 {count} 行",
      polishFallback: "暂不可用",
      polishTooLarge: "过长",
    },
  },
  "todo",
);

function setup(clipboard: string | undefined, result: PolishResult) {
  const notify = vi.fn();
  const insert = vi.fn();
  const polish = vi.fn(async () => result);
  Object.assign(navigator, { clipboard: { readText: vi.fn(async () => clipboard) } });
  return {
    notify,
    insert,
    polish,
    run: () =>
      runSmartPaste({
        kind: "todo",
        polish,
        messages: MESSAGES,
        insert,
        fallbackTexts: (raw) => raw.split("\n"),
        anchor: undefined,
        notify,
      }),
  };
}

const SELECTION_MESSAGES = selectionPolishMessages({
  app: {
    polishWorking: "整理中",
    polishNoteDone: "已排版为 {count} 行",
    polishKeepFallback: "保留原文",
    polishKeepTooLarge: "过长保留",
  },
});

function setupSelection(text: string, result: PolishResult) {
  const notify = vi.fn();
  const apply = vi.fn();
  const polish = vi.fn(async () => result);
  return {
    notify,
    apply,
    polish,
    run: () =>
      runSelectionPolish({
        text,
        kind: "note",
        polish,
        messages: SELECTION_MESSAGES,
        apply,
        anchor: undefined,
        notify,
      }),
  };
}

afterEach(() => {
  Object.assign(navigator, { clipboard: undefined });
});

describe("runSmartPaste", () => {
  it("剪贴板为空/不可读时静默返回", async () => {
    for (const clipboard of [undefined, "", "   "]) {
      const { notify, insert, run } = setup(clipboard, { items: ["A"] });
      await run();
      expect(notify).not.toHaveBeenCalled();
      expect(insert).not.toHaveBeenCalled();
    }
  });

  it("成功：先 working 后 done，插入整理条目并带条数文案", async () => {
    const { notify, insert, polish, run } = setup("买牛奶、交电费", { items: ["买牛奶", "交电费"] });
    await run();

    expect(polish).toHaveBeenCalledWith("todo", "买牛奶、交电费");
    expect(insert).toHaveBeenCalledWith(["买牛奶", "交电费"]);
    expect(notify.mock.calls.map((call) => call[0])).toEqual(["working", "done"]);
    expect(notify.mock.calls[1][1]).toBe("已整理为 2 条提醒");
  });

  it("恰好 2000 字符（限长边界）走服务端并成功落位", async () => {
    const raw = "长".repeat(2000);
    const { notify, insert, polish, run } = setup(raw, { items: ["整理结果"] });
    await run();

    expect(polish).toHaveBeenCalledTimes(1);
    expect(polish).toHaveBeenCalledWith("todo", raw);
    expect(insert).toHaveBeenCalledWith(["整理结果"]);
    expect(notify.mock.calls.map((call) => call[0])).toEqual(["working", "done"]);
  });

  it("降级：LLM 失败与网络失败都插入原文拆分并提示", async () => {
    for (const result of [{ fallback: true } as PolishResult, null]) {
      const { notify, insert, run } = setup("行A\n行B", result);
      await run();

      expect(insert).toHaveBeenCalledWith(["行A", "行B"]);
      expect(notify.mock.calls.map((call) => call[0])).toEqual(["working", "fallback"]);
      expect(notify.mock.calls[1][1]).toBe("暂不可用");
    }
  });

  it("超长：不调服务端，直接原文落位 + 限长提示", async () => {
    const { notify, insert, polish, run } = setup("长".repeat(2001), { items: ["不该出现"] });
    await run();

    expect(polish).not.toHaveBeenCalled();
    expect(insert).toHaveBeenCalledWith(["长".repeat(2001)]);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0]).toEqual(["fallback", "过长", undefined]);
  });
});

describe("runSelectionPolish", () => {
  it("空白文本静默返回", async () => {
    const { notify, apply, run } = setupSelection("   ", { items: ["A"] });
    await run();
    expect(notify).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it("成功：apply 收到整理条目并按行计数提示", async () => {
    const { notify, apply, polish, run } = setupSelection("杂乱段落", { items: ["1、要点A", "2、要点B"] });
    await run();

    expect(polish).toHaveBeenCalledWith("note", "杂乱段落");
    expect(apply).toHaveBeenCalledWith(["1、要点A", "2、要点B"]);
    expect(notify.mock.calls.map((call) => call[0])).toEqual(["working", "done"]);
    expect(notify.mock.calls[1][1]).toBe("已排版为 2 行");
  });

  it("失败：不改动原文，仅提示保留原文（LLM 降级与网络失败同口径）", async () => {
    for (const result of [{ fallback: true } as PolishResult, null]) {
      const { notify, apply, run } = setupSelection("杂乱段落", result);
      await run();

      expect(apply).not.toHaveBeenCalled();
      expect(notify.mock.calls.map((call) => call[0])).toEqual(["working", "fallback"]);
      expect(notify.mock.calls[1][1]).toBe("保留原文");
    }
  });

  it("超长：不调服务端不改动，提示保留原文", async () => {
    const { notify, apply, polish, run } = setupSelection("长".repeat(2001), { items: ["不该出现"] });
    await run();

    expect(polish).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0]).toEqual(["fallback", "过长保留", undefined]);
  });
});

describe("smartPasteMessages", () => {
  it("按 kind 选择 done 模板并替换 {count}", () => {
    const todo = smartPasteMessages(
      { app: { polishWorking: "w", polishTodoDone: "{count} 条提醒", polishNoteDone: "{count} 行", polishFallback: "f", polishTooLarge: "t" } },
      "todo",
    );
    const note = smartPasteMessages(
      { app: { polishWorking: "w", polishTodoDone: "{count} 条提醒", polishNoteDone: "{count} 行", polishFallback: "f", polishTooLarge: "t" } },
      "note",
    );
    expect(todo.done(3)).toBe("3 条提醒");
    expect(note.done(5)).toBe("5 行");
  });

  it("selectionPolishMessages 用保留原文口径", () => {
    const messages = selectionPolishMessages({ app: { polishWorking: "w", polishNoteDone: "{count} 行", polishKeepFallback: "保留原文", polishKeepTooLarge: "过长保留" } });
    expect(messages.done(5)).toBe("5 行");
    expect(messages.fallback).toBe("保留原文");
    expect(messages.tooLarge).toBe("过长保留");
  });
});
