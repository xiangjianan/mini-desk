import type { TodoCompletedVisibility, TodoItem, TodoListConfig, TodoListId, TodoMap, TodoPeriod } from "../types";
import { isValidDeadlineAt } from "./deadlines";

/** 可见提醒条数超过该阈值时，点击/聚焦列表会弹瘦身提示（App.vue 与 TodoPanel 共用）。 */
export const TODO_DENSITY_THRESHOLD = 20;

/** Stable identity key for a todo within its list (used by undo timers, menus, edit state). */
export function todoKey(period: TodoPeriod, id: string): string {
  return `${period}:${id}`;
}

export function getOrderedTodos(todos: TodoItem[] = [], deferredDoneIds: ReadonlySet<string> = new Set()): TodoItem[] {
  const openTodos = todos.filter((todo) => !todo.done || deferredDoneIds.has(todo.id));
  const completedTodos = todos.filter((todo) => todo.done && !deferredDoneIds.has(todo.id));
  return [
    ...prioritizeStarred(openTodos),
    ...completedTodos,
  ];
}

export function addTodo(
  todos: TodoMap,
  period: TodoPeriod,
  todo: TodoItem,
  afterId?: string,
): TodoMap {
  const next = cloneTodoMap(todos);
  const list = ensureTodoList(next, period);
  if (!afterId) {
    const lastOpenIndex = findLastOpenTodoIndex(list);
    list.splice(lastOpenIndex >= 0 ? lastOpenIndex + 1 : 0, 0, todo);
    return next;
  }
  const index = list.findIndex((item) => item.id === afterId);
  list.splice(index >= 0 ? index + 1 : list.length, 0, todo);
  return next;
}

export function splitTodo(
  todos: TodoMap,
  period: TodoPeriod,
  id: string,
  nextTodo: TodoItem,
  before: string,
): TodoMap {
  const next = cloneTodoMap(todos);
  const list = next[period];
  if (!list) return next;
  const index = list.findIndex((item) => item.id === id);
  if (index < 0) return next;
  list[index] = { ...list[index], text: before };
  list.splice(index + 1, 0, nextTodo);
  return next;
}

export function updateTodoText(
  todos: TodoMap,
  period: TodoPeriod,
  id: string,
  text: string,
): TodoMap {
  const next = cloneTodoMap(todos);
  const todo = next[period]?.find((item) => item.id === id);
  if (todo) todo.text = text;
  return next;
}

export function completeTodo(
  todos: TodoMap,
  period: TodoPeriod,
  id: string,
  done: boolean,
): TodoMap {
  const next = cloneTodoMap(todos);
  const todo = next[period]?.find((item) => item.id === id);
  if (todo) todo.done = done;
  return next;
}

export function starTodo(
  todos: TodoMap,
  period: TodoPeriod,
  id: string,
  starred: boolean,
  legacyDeadlineAt?: number,
): TodoMap {
  const next = cloneTodoMap(todos);
  const todo = next[period]?.find((item) => item.id === id);
  if (!todo) return next;
  todo.starred = starred;
  if (starred && isValidDeadlineAt(legacyDeadlineAt)) {
    todo.notifyAt = legacyDeadlineAt;
  }
  delete todo.deadlineAt;
  return next;
}

export function setTodoNotifyAt(
  todos: TodoMap,
  period: TodoPeriod,
  id: string,
  notifyAt?: number,
): TodoMap {
  const next = cloneTodoMap(todos);
  const todo = next[period]?.find((item) => item.id === id);
  if (!todo) return next;
  if (isValidDeadlineAt(notifyAt)) {
    todo.notifyAt = notifyAt;
  } else {
    delete todo.notifyAt;
  }
  delete todo.deadlineAt;
  return next;
}

export function removeTodo(todos: TodoMap, period: TodoPeriod, id: string): TodoMap {
  const next = cloneTodoMap(todos);
  if (!next[period]) return next;
  next[period] = next[period].filter((todo) => todo.id !== id);
  return next;
}

export function clearCompleted(todos: TodoMap, period: TodoPeriod): TodoMap {
  const next = cloneTodoMap(todos);
  if (!next[period]) return next;
  next[period] = next[period].filter((todo) => !todo.done);
  return next;
}

export function removeEmptyTodo(todos: TodoMap, period: TodoPeriod, id: string): TodoMap {
  const todo = todos[period]?.find((item) => item.id === id);
  if (!todo || todo.text.trim()) return todos;
  return removeTodo(todos, period, id);
}

export function moveTodo(
  todos: TodoMap,
  sourcePeriod: TodoPeriod,
  id: string,
  destinationPeriod: TodoPeriod,
  targetId?: string,
): TodoMap {
  if (sourcePeriod === destinationPeriod && id === targetId) return todos;

  const next = cloneTodoMap(todos);
  const source = next[sourcePeriod];
  if (!source) return next;
  const sourceIndex = source.findIndex((todo) => todo.id === id);
  if (sourceIndex < 0) return next;
  const destination = next[destinationPeriod];
  if (!destination) return next;
  const targetIndex = targetId ? destination.findIndex((item) => item.id === targetId) : -1;

  const [todo] = source.splice(sourceIndex, 1);
  destination.splice(targetIndex >= 0 ? targetIndex : destination.length, 0, todo);
  return next;
}

export function removeTodoListData(
  todos: TodoMap,
  showCompleted: TodoCompletedVisibility,
  listId: TodoListId,
): { todos: TodoMap; showCompletedTodos: TodoCompletedVisibility } {
  const nextTodos = cloneTodoMap(todos);
  const nextVisibility = { ...showCompleted };
  delete nextTodos[listId];
  delete nextVisibility[listId];
  return { todos: nextTodos, showCompletedTodos: nextVisibility };
}

/**
 * Auto-distribute lists across `columnCount` columns, column-major (fills
 * column 0 top-to-bottom, then column 1, …) with a left-biased balance: every
 * column gets `floor(N / C)` lists, and the first `N mod C` columns get one
 * extra. This guarantees a column is never shorter than the one to its right
 * (the left column always stays "ahead") and never leaves a trailing column
 * empty. Runs only while the layout is not yet manual. Each list's `column` is
 * overwritten; array order is preserved.
 */
export function distributeTodoListColumns(
  lists: TodoListConfig[],
  columnCount: number,
): TodoListConfig[] {
  const columns = Math.max(1, Math.floor(columnCount));
  if (columns === 1) {
    return lists.map((list) => (list.column === 0 ? list : { ...list, column: 0 }));
  }
  const base = Math.floor(lists.length / columns);
  const remainder = lists.length % columns;
  // Map each list index to its column by walking the per-column sizes left to
  // right. Column c holds `base + 1` lists while c < remainder, else `base`.
  const columnOfIndex = new Array<number>(lists.length);
  let cursor = 0;
  for (let column = 0; column < columns; column += 1) {
    const size = base + (column < remainder ? 1 : 0);
    for (let offset = 0; offset < size; offset += 1) {
      columnOfIndex[cursor] = column;
      cursor += 1;
    }
  }
  return lists.map((list, index) => {
    const column = columnOfIndex[index] ?? columns - 1;
    return list.column === column ? list : { ...list, column };
  });
}

/**
 * Move the dragged list into `targetColumn`, positioned relative to an anchor
 * list (which must already be in that column). Used for both dropping onto a
 * list (`insertBefore` controls before/after the anchor) and dropping into a
 * column's blank space (`anchorId === null` → appended after the last list
 * currently in `targetColumn`). Always updates the dragged list's `column`.
 * No-op when the dragged list is missing or the target column is negative.
 */
export function assignTodoListColumn(
  lists: TodoListConfig[],
  draggedId: TodoListId,
  targetColumn: number,
  anchorId: TodoListId | null,
  insertBefore: boolean,
): TodoListConfig[] {
  const sourceIndex = lists.findIndex((list) => list.id === draggedId);
  if (sourceIndex < 0 || targetColumn < 0) return lists;
  const column = Math.floor(targetColumn);
  const next = lists.map((list) => ({ ...list }));
  const [dragged] = next.splice(sourceIndex, 1);
  const moved = dragged.column === column ? dragged : { ...dragged, column };
  let insertIndex: number;
  if (anchorId !== null && anchorId !== draggedId) {
    const anchorIndex = next.findIndex((list) => list.id === anchorId);
    insertIndex = anchorIndex >= 0 ? (insertBefore ? anchorIndex : anchorIndex + 1) : next.length;
  } else {
    // Blank space: land at the end of targetColumn's current lists.
    let lastInColumn = -1;
    next.forEach((list, index) => {
      if (list.column === column) lastInColumn = index;
    });
    insertIndex = lastInColumn + 1;
  }
  next.splice(insertIndex, 0, moved);
  return next;
}

export function cloneTodoMap(todos: TodoMap): TodoMap {
  return Object.fromEntries(
    Object.entries(todos).map(([period, list]) => [period, list.map((todo) => ({ ...todo }))]),
  ) as TodoMap;
}

function ensureTodoList(todos: TodoMap, period: TodoPeriod): TodoItem[] {
  todos[period] ??= [];
  return todos[period];
}

function findLastOpenTodoIndex(todos: TodoItem[]): number {
  for (let index = todos.length - 1; index >= 0; index -= 1) {
    if (!todos[index].done) return index;
  }
  return -1;
}

function prioritizeStarred(todos: TodoItem[]): TodoItem[] {
  return todos
    .map((todo, index) => ({ todo, index }))
    .sort((left, right) => {
      const leftRank = getOpenTodoRank(left.todo);
      const rightRank = getOpenTodoRank(right.todo);
      if (leftRank !== rightRank) return leftRank - rightRank;
      return left.index - right.index;
    })
    .map((entry) => entry.todo);
}

function getOpenTodoRank(todo: TodoItem): number {
  if (todo.starred) return 0;
  return 1;
}

function getTodoGroupKey(todo: TodoItem): string {
  return `${todo.done ? "done" : "open"}:${todo.starred ? "starred" : "plain"}`;
}

/**
 * Ctrl/Cmd+Up/Down 的移动目标，按 moveTodo() 的落位语义表达（targetIndex
 * 在移除被移条目前计算：上移 = 插到目标前，下移 = 落在目标原索引处，即
 * 目标之后）。`ordered` 是该列表的可见显示顺序（getOrderedTodos 的结果）。
 * 移动限制在同一视觉分组（相同 done + starred）：跨组换位在显示上没有
 * 效果。上移 → 上一个同组成员；下移 → 下一个同组成员；组内无移动空间
 * 或找不到条目返回 null（无操作，不触发保存）。
 */
export function getTodoReorderTarget(ordered: TodoItem[], id: string, direction: -1 | 1): { targetId: string } | null {
  const index = ordered.findIndex((todo) => todo.id === id);
  if (index < 0) return null;
  const key = getTodoGroupKey(ordered[index]);

  const step = direction === -1 ? -1 : 1;
  for (let i = index + step; i >= 0 && i < ordered.length; i += step) {
    if (getTodoGroupKey(ordered[i]) === key) return { targetId: ordered[i].id };
  }
  return null;
}
