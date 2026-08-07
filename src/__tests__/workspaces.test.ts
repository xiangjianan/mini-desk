import { describe, expect, it } from "vitest";
import { defaultWorkspace } from "../state/defaults";
import type { WorkspaceData } from "../types";
import {
  buildWorkspaceCustomTitles,
  createWorkspaceData,
  ensureUniqueWorkspaceTitle,
  removeWorkspace,
  reorderWorkspaces,
} from "../state/workspaces";

describe("workspace helpers", () => {
  it("createWorkspaceData 用标题与 slogan 生成空白工作空间", () => {
    const workspace = createWorkspaceData("我的空间", "加油", 100, "ws-1");

    expect(workspace.id).toBe("ws-1");
    expect(workspace.createdAt).toBe(100);
    expect(workspace.customTitles).toEqual({ "board-title": "我的空间", "board-slogan": "加油" });
    expect(workspace.images).toEqual([]);
    expect(workspace.todoLists.map((list) => list.id)).toEqual(["morning"]);
  });

  it("createWorkspaceData 省略标题/slogan 时不写入 customTitles", () => {
    const workspace = createWorkspaceData("  ", "", 1, "ws-2");
    expect(workspace.customTitles).toEqual({});
  });

  it("defaultWorkspace 带有默认 slogan，供首次打开的默认空间展示", () => {
    const workspace = defaultWorkspace();

    expect(workspace.customTitles["board-slogan"]).toBe("Do less, do it well.");
  });

  it("createWorkspaceData 新建空间不沿用默认 slogan", () => {
    const workspace = createWorkspaceData("我的桌面", "", 1, "ws-3");

    expect(workspace.customTitles["board-slogan"]).toBeUndefined();
  });

  it("ensureUniqueWorkspaceTitle 为重名标题加后缀", () => {
    const existing: WorkspaceData[] = [
      { ...defaultWorkspace("a"), customTitles: { "board-title": "项目" } },
    ];
    const created = createWorkspaceData("项目", "", 1, "b");

    expect(ensureUniqueWorkspaceTitle(created, existing).customTitles["board-title"]).toBe("项目 2");
  });

  it("removeWorkspace 删除非活动空间并保留当前活动空间", () => {
    const workspaces = [
      { ...defaultWorkspace("a"), customTitles: { "board-title": "A" } },
      { ...defaultWorkspace("b"), customTitles: { "board-title": "B" } },
    ];

    const result = removeWorkspace(workspaces, "a", "b");
    expect(result.workspaces.map((w) => w.id)).toEqual(["a"]);
    expect(result.activeWorkspaceId).toBe("a");
  });

  it("removeWorkspace 删除活动空间时切换到相邻空间", () => {
    const workspaces = [
      { ...defaultWorkspace("a"), customTitles: { "board-title": "A" } },
      { ...defaultWorkspace("b"), customTitles: { "board-title": "B" } },
      { ...defaultWorkspace("c"), customTitles: { "board-title": "C" } },
    ];

    const result = removeWorkspace(workspaces, "b", "b");
    expect(result.workspaces.map((w) => w.id)).toEqual(["a", "c"]);
    expect(result.activeWorkspaceId).toBe("a");
  });

  it("removeWorkspace 至少保留一个工作空间", () => {
    const workspaces = [{ ...defaultWorkspace("a") }];
    expect(removeWorkspace(workspaces, "a", "a")).toEqual({ workspaces, activeWorkspaceId: "a" });
  });

  it("reorderWorkspaces 移动工作空间顺序", () => {
    const workspaces = [
      { ...defaultWorkspace("a") },
      { ...defaultWorkspace("b") },
      { ...defaultWorkspace("c") },
    ];

    expect(reorderWorkspaces(workspaces, "c", "a").map((w) => w.id)).toEqual(["c", "a", "b"]);
    expect(reorderWorkspaces(workspaces, "a", "a").map((w) => w.id)).toEqual(["a", "b", "c"]);
  });

  it("buildWorkspaceCustomTitles 去除首尾空白", () => {
    expect(buildWorkspaceCustomTitles("  T  ", "  S  ")).toEqual({ "board-title": "T", "board-slogan": "S" });
  });
});
