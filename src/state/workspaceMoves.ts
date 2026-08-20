import { createId } from "./storage";
import { addTodo as addTodoToMap, removeTodo as removeTodoFromMap } from "./todos";
import type { QuickButton, QuickTag, TodoItem, TodoListId, TodoMap, WorkspaceData } from "../types";

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

/** 目标已占用同一 id 时重新生成（同一导入文件可进两个空间产生重复 id）。 */
function uniqueIdAmong(taken: Iterable<string>, desired: string): string {
  return [...taken].includes(desired) ? createId() : desired;
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

    const moved: QuickButton = {
      ...button,
      id: uniqueIdAmong(to.quickButtons.map((item) => item.id), button.id),
    };
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
    const movedTagId = existing
      ? existing.id
      : uniqueIdAmong(to.quickTags.map((item) => item.id), tag.id);
    const takenButtonIds = new Set(to.quickButtons.map((item) => item.id));
    const movedButtons = from.quickButtons
      .filter((button) => button.tagId === tagId)
      .map((button) => ({
        ...button,
        id: uniqueIdAmong(takenButtonIds, button.id),
        tagId: movedTagId,
      }));

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

/**
 * 移动整个提醒列表（配置 + 提醒 + 完成区可见性）到目标空间列表末尾。
 * `column` 保留原值（展示端会按目标列数收敛）。源只剩一个列表时拒绝——
 * 每个空间至少保留一个列表。目标已有同 id 列表时重新生成列表 id，
 * 并同步迁移 todos/showCompletedTodos 的键，避免覆盖目标自身数据。
 * 默认空间的 morning/noon/evening 列表 id 天然互撞，重生成是预期路径而非异常。
 */
export function moveTodoListToWorkspace(
  workspaces: WorkspaceData[],
  fromWorkspaceId: string,
  listId: TodoListId,
  toWorkspaceId: string,
): WorkspaceData[] {
  return transferWorkspaceItem(workspaces, fromWorkspaceId, toWorkspaceId, (from, to) => {
    if (from.todoLists.length <= 1) return null;
    const list = from.todoLists.find((item) => item.id === listId);
    if (!list) return null;

    const { [listId]: movedTodos = [], ...restTodos } = from.todos;
    const { [listId]: movedVisibility, ...restVisibility } = from.showCompletedTodos;
    const movedListId = uniqueIdAmong(to.todoLists.map((item) => item.id), listId);

    return {
      from: {
        ...from,
        todoLists: from.todoLists.filter((item) => item.id !== listId),
        todos: restTodos as TodoMap,
        showCompletedTodos: restVisibility,
      },
      to: {
        ...to,
        todoLists: [...to.todoLists, { ...list, id: movedListId }],
        todos: { ...to.todos, [movedListId]: movedTodos.map((todo) => ({ ...todo })) },
        showCompletedTodos: movedVisibility === undefined
          ? to.showCompletedTodos
          : { ...to.showCompletedTodos, [movedListId]: movedVisibility },
      },
    };
  });
}

/**
 * 移动单条提醒到目标空间的指定列表，插在目标最后一条未完成之后。
 * 目标列表已有同 id 提醒时重新生成提醒 id，避免跨空间 id 碰撞。
 */
export function moveTodoToWorkspace(
  workspaces: WorkspaceData[],
  fromWorkspaceId: string,
  fromListId: TodoListId,
  todoId: string,
  toWorkspaceId: string,
  toListId: TodoListId,
): WorkspaceData[] {
  return transferWorkspaceItem(workspaces, fromWorkspaceId, toWorkspaceId, (from, to) => {
    const todo = from.todos[fromListId]?.find((item) => item.id === todoId);
    if (!todo) return null;
    if (!to.todoLists.some((list) => list.id === toListId)) return null;

    const moved: TodoItem = {
      ...todo,
      id: uniqueIdAmong((to.todos[toListId] ?? []).map((item) => item.id), todo.id),
    };

    return {
      from: { ...from, todos: removeTodoFromMap(from.todos, fromListId, todoId) },
      to: { ...to, todos: addTodoToMap(to.todos, toListId, moved) },
    };
  });
}

/**
 * 移动便签 Tab 页到目标空间末尾。源只剩一个空间时拒绝。移动的是源激活
 * 空间时，源 activeSpaceId 切到相邻空间（优先前一个，同 deleteSpace 规则）。
 * 目标已存在同 id 空间时重新生成 id（经 uniqueIdAmong）。
 */
export function moveSpaceToWorkspace(
  workspaces: WorkspaceData[],
  fromWorkspaceId: string,
  spaceId: string,
  toWorkspaceId: string,
): WorkspaceData[] {
  return transferWorkspaceItem(workspaces, fromWorkspaceId, toWorkspaceId, (from, to) => {
    if (from.spaces.length <= 1) return null;
    const index = from.spaces.findIndex((space) => space.id === spaceId);
    if (index < 0) return null;

    const space = from.spaces[index];
    const remainingSpaces = from.spaces.filter((_, itemIndex) => itemIndex !== index);
    const activeSpaceId = from.activeSpaceId === spaceId
      ? remainingSpaces[Math.max(0, index - 1)]?.id ?? remainingSpaces[0].id
      : from.activeSpaceId;

    return {
      from: { ...from, spaces: remainingSpaces, activeSpaceId },
      to: {
        ...to,
        spaces: [
          ...to.spaces,
          {
            ...space,
            id: uniqueIdAmong(to.spaces.map((item) => item.id), space.id),
            lines: space.lines.map((line) => ({ ...line })),
          },
        ],
      },
    };
  });
}
