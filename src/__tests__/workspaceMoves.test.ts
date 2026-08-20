import { describe, expect, it } from "vitest";
import {
  moveQuickButtonToWorkspace,
  moveQuickTagToWorkspace,
} from "../state/workspaceMoves";
import { defaultWorkspace } from "../state/defaults";
import type { WorkspaceData } from "../types";

function workspace(id: string, overrides: Partial<WorkspaceData> = {}): WorkspaceData {
  return { ...defaultWorkspace(id), ...overrides };
}

describe("moveQuickButtonToWorkspace", () => {
  const tag = { id: "tag-1", title: "常用", color: "#4ade80" };
  const button = { id: "btn-1", title: "搜索", value: "https://example.com", type: "link" as const, tagId: "tag-1", hidden: false };
  const source = workspace("ws-a", { quickTags: [tag], quickButtons: [button] });
  const target = workspace("ws-b");

  it("移动按钮并在目标重建同名同色标签", () => {
    const next = moveQuickButtonToWorkspace([source, target], "ws-a", "btn-1", "ws-b");
    const from = next.find((w) => w.id === "ws-a")!;
    const to = next.find((w) => w.id === "ws-b")!;
    expect(from.quickButtons).toHaveLength(0);
    expect(to.quickButtons).toHaveLength(1);
    expect(to.quickTags).toHaveLength(1);
    expect(to.quickTags[0]).toMatchObject({ title: "常用", color: "#4ade80" });
    expect(to.quickButtons[0].tagId).toBe(to.quickTags[0].id);
  });

  it("目标已有同名标签则直接挂到现有标签", () => {
    const existing = { id: "tag-9", title: "常用" };
    const next = moveQuickButtonToWorkspace([source, workspace("ws-b", { quickTags: [existing] })], "ws-a", "btn-1", "ws-b");
    const to = next.find((w) => w.id === "ws-b")!;
    expect(to.quickTags).toHaveLength(1);
    expect(to.quickButtons[0].tagId).toBe("tag-9");
  });

  it("悬空 tagId 视为无标签，直接迁移", () => {
    const orphan = { ...button, id: "btn-2", tagId: "missing" };
    const next = moveQuickButtonToWorkspace([workspace("ws-a", { quickTags: [tag], quickButtons: [orphan] }), target], "ws-a", "btn-2", "ws-b");
    const to = next.find((w) => w.id === "ws-b")!;
    expect(to.quickTags).toHaveLength(0);
    expect(to.quickButtons[0].tagId).toBeUndefined();
  });

  it("未知 id 或同空间时返回原数组引用", () => {
    const workspaces = [source, target];
    expect(moveQuickButtonToWorkspace(workspaces, "ws-a", "nope", "ws-b")).toBe(workspaces);
    expect(moveQuickButtonToWorkspace(workspaces, "ws-a", "btn-1", "ws-a")).toBe(workspaces);
  });

  it("不修改输入数据", () => {
    moveQuickButtonToWorkspace([source, target], "ws-a", "btn-1", "ws-b");
    expect(source.quickButtons).toHaveLength(1);
    expect(target.quickButtons).toHaveLength(0);
    expect(target.quickTags).toHaveLength(0);
  });
});

describe("moveQuickTagToWorkspace", () => {
  const tag = { id: "tag-1", title: "常用" };
  const inTag = { id: "btn-1", title: "a", value: "va", type: "link" as const, tagId: "tag-1", hidden: false };
  const loose = { id: "btn-2", title: "b", value: "vb", type: "text" as const, hidden: false };
  const source = workspace("ws-a", { quickTags: [tag], quickButtons: [inTag, loose] });
  const target = workspace("ws-b");

  it("标签连同其下按钮一起移动，其他按钮留下", () => {
    const next = moveQuickTagToWorkspace([source, target], "ws-a", "tag-1", "ws-b");
    const from = next.find((w) => w.id === "ws-a")!;
    const to = next.find((w) => w.id === "ws-b")!;
    expect(from.quickTags).toHaveLength(0);
    expect(from.quickButtons.map((b) => b.id)).toEqual(["btn-2"]);
    expect(to.quickTags.map((t) => t.title)).toEqual(["常用"]);
    expect(to.quickButtons.map((b) => b.id)).toEqual(["btn-1"]);
    expect(to.quickButtons[0].tagId).toBe("tag-1");
  });

  it("目标有同名标签时合并：按钮改挂现有标签，不新增标签", () => {
    const existing = { id: "tag-9", title: "常用" };
    const next = moveQuickTagToWorkspace([source, workspace("ws-b", { quickTags: [existing] })], "ws-a", "tag-1", "ws-b");
    const to = next.find((w) => w.id === "ws-b")!;
    expect(to.quickTags).toHaveLength(1);
    expect(to.quickButtons[0].tagId).toBe("tag-9");
  });

  it("未知标签返回原数组", () => {
    const workspaces = [source, target];
    expect(moveQuickTagToWorkspace(workspaces, "ws-a", "nope", "ws-b")).toBe(workspaces);
  });
});
