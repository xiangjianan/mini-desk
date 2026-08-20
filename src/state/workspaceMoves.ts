import { createId } from "./storage";
import type { QuickButton, QuickTag, WorkspaceData } from "../types";

/**
 * 跨工作空间移动：快捷按钮/标签、提醒列表/单条提醒、便签 Tab 页。
 * 全部纯函数：返回新的 workspaces 数组（不适用时返回原数组引用），
 * 从不修改入参，与 state/todos.ts 的不可变风格一致。
 */

/** 在数组中替换 from/to 两个工作空间；build 返回 null 表示无操作。 */
function transferWorkspaceItem(
  workspaces: WorkspaceData[],
  fromWorkspaceId: string,
  toWorkspaceId: string,
  build: (from: WorkspaceData, to: WorkspaceData) => { from: WorkspaceData; to: WorkspaceData } | null,
): WorkspaceData[] {
  if (fromWorkspaceId === toWorkspaceId) return workspaces;
  const from = workspaces.find((workspace) => workspace.id === fromWorkspaceId);
  const to = workspaces.find((workspace) => workspace.id === toWorkspaceId);
  if (!from || !to) return workspaces;
  const result = build(from, to);
  if (!result) return workspaces;
  return workspaces.map((workspace) => {
    if (workspace.id === fromWorkspaceId) return result.from;
    if (workspace.id === toWorkspaceId) return result.to;
    return workspace;
  });
}

/**
 * 移动单个快捷按钮。标签仍存在时保留分组：使用目标的同名标签，没有则在
 * 目标新建同名同色标签；悬空 tagId 视为无标签（落入目标的「其他」分组）。
 * 目标已有同 id 时重新生成 id，避免跨空间 id 碰撞。
 */
export function moveQuickButtonToWorkspace(
  workspaces: WorkspaceData[],
  fromWorkspaceId: string,
  buttonId: string,
  toWorkspaceId: string,
): WorkspaceData[] {
  return transferWorkspaceItem(workspaces, fromWorkspaceId, toWorkspaceId, (from, to) => {
    const button = from.quickButtons.find((item) => item.id === buttonId);
    if (!button) return null;

    const buttonIdTaken = to.quickButtons.some((item) => item.id === button.id);

    let quickTags = to.quickTags;
    let tagId: string | undefined;
    const sourceTag = button.tagId ? from.quickTags.find((tag) => tag.id === button.tagId) : undefined;
    if (sourceTag) {
      const existing = to.quickTags.find((tag) => tag.title === sourceTag.title);
      if (existing) {
        tagId = existing.id;
      } else {
        const created: QuickTag = sourceTag.color
          ? { id: createId(), title: sourceTag.title, color: sourceTag.color }
          : { id: createId(), title: sourceTag.title };
        quickTags = [...to.quickTags, created];
        tagId = created.id;
      }
    }

    const moved: QuickButton = { ...button, ...(buttonIdTaken ? { id: createId() } : {}) };
    if (tagId) moved.tagId = tagId;
    else delete moved.tagId;

    return {
      from: { ...from, quickButtons: from.quickButtons.filter((item) => item.id !== buttonId) },
      to: { ...to, quickTags, quickButtons: [...to.quickButtons, moved] },
    };
  });
}

/**
 * 移动快捷标签及其下全部按钮。目标已有同名标签时合并进去（按钮改挂现有
 * 标签），否则标签追加到目标 quickTags 末尾，按钮追加到 quickButtons 末尾。
 * 目标已有同 id 时重新生成 id，避免跨空间 id 碰撞。
 */
export function moveQuickTagToWorkspace(
  workspaces: WorkspaceData[],
  fromWorkspaceId: string,
  tagId: string,
  toWorkspaceId: string,
): WorkspaceData[] {
  return transferWorkspaceItem(workspaces, fromWorkspaceId, toWorkspaceId, (from, to) => {
    const tag = from.quickTags.find((item) => item.id === tagId);
    if (!tag) return null;

    const existing = to.quickTags.find((item) => item.title === tag.title);
    const tagIdTaken = !existing && to.quickTags.some((item) => item.id === tag.id);
    const movedTagId = existing ? existing.id : tagIdTaken ? createId() : tag.id;
    const movedButtons = from.quickButtons
      .filter((button) => button.tagId === tagId)
      .map((button) => ({ ...button, tagId: movedTagId }));

    return {
      from: {
        ...from,
        quickTags: from.quickTags.filter((item) => item.id !== tagId),
        quickButtons: from.quickButtons.filter((button) => button.tagId !== tagId),
      },
      to: {
        ...to,
        quickTags: existing ? to.quickTags : [...to.quickTags, { ...tag, id: movedTagId }],
        quickButtons: [...to.quickButtons, ...movedButtons],
      },
    };
  });
}
