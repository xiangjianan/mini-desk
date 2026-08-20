import { describe, expect, it } from "vitest";
import {
  moveQuickButtonToWorkspace,
  moveQuickTagToWorkspace,
  moveSpaceToWorkspace,
  moveTodoListToWorkspace,
  moveTodoToWorkspace,
} from "../state/workspaceMoves";
import { defaultWorkspace } from "../state/defaults";
import type { TodoMap, WorkspaceData } from "../types";

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

  it("目标已有同 id 按钮时重新生成 id", () => {
    const clash = { id: "btn-1", title: "同名", value: "v", type: "text" as const, hidden: false };
    const next = moveQuickButtonToWorkspace([source, workspace("ws-b", { quickButtons: [clash] })], "ws-a", "btn-1", "ws-b");
    const to = next.find((w) => w.id === "ws-b")!;
    expect(to.quickButtons).toHaveLength(2);
    const ids = to.quickButtons.map((b) => b.id);
    expect(new Set(ids).size).toBe(2);
    expect(to.quickButtons[1].title).toBe("搜索");
    expect(to.quickButtons[1].tagId).toBe(to.quickTags[0].id);
  });

  it("移动的按钮保留 hidden 等字段", () => {
    const hiddenButton = { ...button, id: "btn-h", hidden: true };
    const next = moveQuickButtonToWorkspace([workspace("ws-a", { quickTags: [tag], quickButtons: [hiddenButton] }), target], "ws-a", "btn-h", "ws-b");
    const to = next.find((w) => w.id === "ws-b")!;
    expect(to.quickButtons[0].hidden).toBe(true);
  });

  it("未知工作空间返回原数组", () => {
    const workspaces = [source, target];
    expect(moveQuickButtonToWorkspace(workspaces, "missing", "btn-1", "ws-b")).toBe(workspaces);
    expect(moveQuickButtonToWorkspace(workspaces, "ws-a", "btn-1", "missing")).toBe(workspaces);
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

  it("无关的第三方工作空间保持原对象引用", () => {
    const bystander = workspace("ws-c");
    const next = moveQuickTagToWorkspace([source, target, bystander], "ws-a", "tag-1", "ws-b");
    expect(next.find((w) => w.id === "ws-c")).toBe(bystander);
  });

  it("目标已有同 id 不同名标签时重新生成标签 id 并重挂按钮", () => {
    const clash = { id: "tag-1", title: "另一个" };
    const next = moveQuickTagToWorkspace([source, workspace("ws-b", { quickTags: [clash] })], "ws-a", "tag-1", "ws-b");
    const to = next.find((w) => w.id === "ws-b")!;
    expect(to.quickTags).toHaveLength(2);
    expect(to.quickTags.map((t) => t.id)).toEqual(["tag-1", expect.any(String)]);
    expect(to.quickTags[1].id).not.toBe("tag-1");
    expect(to.quickButtons[0].tagId).toBe(to.quickTags[1].id);
  });

  it("随标签移动的按钮与目标已有同 id 时重新生成", () => {
    const clash = { id: "btn-1", title: "同名", value: "v", type: "text" as const, hidden: false };
    const next = moveQuickTagToWorkspace([source, workspace("ws-b", { quickButtons: [clash] })], "ws-a", "tag-1", "ws-b");
    const to = next.find((w) => w.id === "ws-b")!;
    expect(to.quickButtons).toHaveLength(2);
    const ids = to.quickButtons.map((b) => b.id);
    expect(new Set(ids).size).toBe(2);
    expect(to.quickButtons[1].tagId).toBeDefined();
  });
});

describe("moveTodoListToWorkspace", () => {
  const list = { id: "list-1", title: "清单一", collapsed: false, compact: false, column: 1 };
  const source = workspace("ws-a", {
    todoLists: [list, { id: "list-2", title: "清单二", collapsed: false, compact: false }],
    todos: { "list-1": [{ id: "todo-1", text: "任务", done: false }] } as TodoMap,
    showCompletedTodos: { "list-1": false },
  });
  const target = workspace("ws-b", { todoLists: [], todos: {} as TodoMap, showCompletedTodos: {} });

  it("迁移列表配置、提醒与完成区可见性到目标末尾", () => {
    const next = moveTodoListToWorkspace([source, target], "ws-a", "list-1", "ws-b");
    const from = next.find((w) => w.id === "ws-a")!;
    const to = next.find((w) => w.id === "ws-b")!;
    expect(from.todoLists.map((l) => l.id)).toEqual(["list-2"]);
    expect(from.todos["list-1"]).toBeUndefined();
    expect(from.showCompletedTodos["list-1"]).toBeUndefined();
    expect(to.todoLists.map((l) => l.id)).toEqual(["list-1"]);
    expect(to.todoLists[0].column).toBe(1);
    expect(to.todos["list-1"]).toEqual([{ id: "todo-1", text: "任务", done: false }]);
    expect(to.showCompletedTodos["list-1"]).toBe(false);
  });

  it("源只剩一个列表时拒绝（返回原数组）", () => {
    const single = workspace("ws-a", { todoLists: [list], todos: { "list-1": [] } as TodoMap });
    const workspaces = [single, target];
    expect(moveTodoListToWorkspace(workspaces, "ws-a", "list-1", "ws-b")).toBe(workspaces);
  });

  it("未知列表 id 返回原数组引用", () => {
    const workspaces = [source, target];
    expect(moveTodoListToWorkspace(workspaces, "ws-a", "missing", "ws-b")).toBe(workspaces);
  });

  it("源列表无完成区可见性记录时，目标的可见性原样保留", () => {
    // movedVisibility === undefined：不为迁移列表写入新键，目标已有键不受影响。
    const bareSource = workspace("ws-a", {
      todoLists: [list, { id: "list-2", title: "清单二", collapsed: false, compact: false }],
      todos: { "list-1": [{ id: "todo-1", text: "任务", done: false }] } as TodoMap,
      showCompletedTodos: { "list-2": true },
    });
    const visibleTarget = workspace("ws-b", { todoLists: [], todos: {} as TodoMap, showCompletedTodos: { "other-list": false } });
    const next = moveTodoListToWorkspace([bareSource, visibleTarget], "ws-a", "list-1", "ws-b");
    const to = next.find((w) => w.id === "ws-b")!;
    expect(to.showCompletedTodos).toEqual({ "other-list": false });
    expect(Object.keys(to.showCompletedTodos)).not.toContain("list-1");
  });

  it("目标已有同 id 列表时重新生成列表 id 并迁移数据键", () => {
    const clashList = { id: "list-1", title: "目标自己的", collapsed: true, compact: false };
    const clashy = workspace("ws-b", {
      todoLists: [clashList],
      todos: { "list-1": [{ id: "todo-x", text: "目标自己的提醒", done: false }] } as TodoMap,
    });
    const next = moveTodoListToWorkspace([source, clashy], "ws-a", "list-1", "ws-b");
    const to = next.find((w) => w.id === "ws-b")!;
    const [, movedList] = to.todoLists;
    expect(to.todoLists).toHaveLength(2);
    expect(to.todoLists[0]).toMatchObject({ id: "list-1", title: "目标自己的" });
    expect(movedList.id).not.toBe("list-1");
    expect(to.todos["list-1"]).toEqual([{ id: "todo-x", text: "目标自己的提醒", done: false }]);
    expect(to.todos[movedList.id]).toEqual([{ id: "todo-1", text: "任务", done: false }]);
  });
});

describe("moveTodoToWorkspace", () => {
  const source = workspace("ws-a", {
    todoLists: [{ id: "list-1", title: "清单一", collapsed: false, compact: false }],
    todos: { "list-1": [{ id: "todo-open", text: "进行中", done: false }, { id: "todo-2", text: "完成", done: true }] } as TodoMap,
  });
  const target = workspace("ws-b", {
    todoLists: [{ id: "list-b1", title: "目标清单", collapsed: false, compact: false }],
    todos: { "list-b1": [{ id: "todo-done", text: "已完成", done: true }] } as TodoMap,
  });

  it("插入目标列表最后一条未完成之后（完成区之前）", () => {
    const next = moveTodoToWorkspace([source, target], "ws-a", "list-1", "todo-open", "ws-b", "list-b1");
    const from = next.find((w) => w.id === "ws-a")!;
    const to = next.find((w) => w.id === "ws-b")!;
    expect(from.todos["list-1"].map((t) => t.id)).toEqual(["todo-2"]);
    expect(to.todos["list-b1"].map((t) => t.id)).toEqual(["todo-open", "todo-done"]);
  });

  it("目标列表不存在时返回原数组", () => {
    const workspaces = [source, target];
    expect(moveTodoToWorkspace(workspaces, "ws-a", "list-1", "todo-open", "ws-b", "missing")).toBe(workspaces);
  });

  it("未知提醒 id 返回原数组引用", () => {
    const workspaces = [source, target];
    expect(moveTodoToWorkspace(workspaces, "ws-a", "list-1", "missing", "ws-b", "list-b1")).toBe(workspaces);
  });

  it("目标列表已有同 id 提醒时重新生成提醒 id", () => {
    const clashy = workspace("ws-b", {
      todoLists: [{ id: "list-b1", title: "目标清单", collapsed: false, compact: false }],
      todos: { "list-b1": [{ id: "todo-open", text: "目标自己的", done: false }] } as TodoMap,
    });
    const next = moveTodoToWorkspace([source, clashy], "ws-a", "list-1", "todo-open", "ws-b", "list-b1");
    const to = next.find((w) => w.id === "ws-b")!;
    const ids = to.todos["list-b1"].map((t) => t.id);
    expect(new Set(ids).size).toBe(2);
    expect(to.todos["list-b1"].some((t) => t.text === "进行中")).toBe(true);
  });
});

describe("moveSpaceToWorkspace", () => {
  const spaces = [
    { id: "space-1", title: "便签一", lines: [{ text: "内容", indent: 0 }] },
    { id: "space-2", title: "便签二", lines: [] },
  ];
  const source = workspace("ws-a", { spaces, activeSpaceId: "space-2" });
  const target = workspace("ws-b", { spaces: [{ id: "space-b1", title: "目标便签", lines: [] }] });

  it("移动到目标末尾并克隆行数据", () => {
    const next = moveSpaceToWorkspace([source, target], "ws-a", "space-1", "ws-b");
    const from = next.find((w) => w.id === "ws-a")!;
    const to = next.find((w) => w.id === "ws-b")!;
    expect(from.spaces.map((s) => s.id)).toEqual(["space-2"]);
    expect(from.activeSpaceId).toBe("space-2");
    expect(to.spaces.map((s) => s.id)).toEqual(["space-b1", "space-1"]);
    expect(to.spaces[1].lines).toEqual([{ text: "内容", indent: 0 }]);
  });

  it("移动的是激活空间时，源切换到前一个邻居", () => {
    const next = moveSpaceToWorkspace([source, target], "ws-a", "space-2", "ws-b");
    const from = next.find((w) => w.id === "ws-a")!;
    expect(from.activeSpaceId).toBe("space-1");
  });

  it("源只剩一个空间时拒绝", () => {
    const single = workspace("ws-a", { spaces: [spaces[0]], activeSpaceId: "space-1" });
    const workspaces = [single, target];
    expect(moveSpaceToWorkspace(workspaces, "ws-a", "space-1", "ws-b")).toBe(workspaces);
  });

  it("未知空间 id 返回原数组引用", () => {
    const workspaces = [source, target];
    expect(moveSpaceToWorkspace(workspaces, "ws-a", "missing", "ws-b")).toBe(workspaces);
  });

  it("移动的是激活且为首的空间时，源切到第一个剩余空间（index 0 钳位）", () => {
    const three = [
      { id: "space-1", title: "便签一", lines: [] },
      { id: "space-2", title: "便签二", lines: [] },
      { id: "space-3", title: "便签三", lines: [] },
    ];
    const activeFirst = workspace("ws-a", { spaces: three, activeSpaceId: "space-1" });
    const next = moveSpaceToWorkspace([activeFirst, target], "ws-a", "space-1", "ws-b");
    const from = next.find((w) => w.id === "ws-a")!;
    expect(from.spaces.map((s) => s.id)).toEqual(["space-2", "space-3"]);
    expect(from.activeSpaceId).toBe("space-2");
  });

  it("目标已有同 id 空间时重新生成 id 且保留目标原空间", () => {
    const clashing = workspace("ws-b", { spaces: [{ id: "space-1", title: "目标同名", lines: [] }] });
    const next = moveSpaceToWorkspace([source, clashing], "ws-a", "space-1", "ws-b");
    const to = next.find((w) => w.id === "ws-b")!;
    expect(to.spaces).toHaveLength(2);
    expect(to.spaces[0]).toEqual({ id: "space-1", title: "目标同名", lines: [] });
    expect(to.spaces[1].id).not.toBe("space-1");
    expect(to.spaces[1].lines).toEqual([{ text: "内容", indent: 0 }]);
  });
});
