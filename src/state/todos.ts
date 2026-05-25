import type { TodoItem, TodoMap, TodoPeriod } from "../types";
import { isValidDeadlineAt } from "./deadlines";

export function getOrderedTodos(todos: TodoItem[], deferredDoneIds: ReadonlySet<string> = new Set()): TodoItem[] {
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
  const list = next[period];
  if (!afterId) {
    const firstCompletedIndex = list.findIndex((item) => item.done);
    list.splice(firstCompletedIndex >= 0 ? firstCompletedIndex : list.length, 0, todo);
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
  const todo = next[period].find((item) => item.id === id);
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
  const todo = next[period].find((item) => item.id === id);
  if (todo) todo.done = done;
  return next;
}

export function starTodo(
  todos: TodoMap,
  period: TodoPeriod,
  id: string,
  starred: boolean,
  _legacyDeadlineAt?: number,
): TodoMap {
  const next = cloneTodoMap(todos);
  const todo = next[period].find((item) => item.id === id);
  if (!todo) return next;
  todo.starred = starred;
  return next;
}

export function setTodoNotifyAt(
  todos: TodoMap,
  period: TodoPeriod,
  id: string,
  notifyAt?: number,
): TodoMap {
  const next = cloneTodoMap(todos);
  const todo = next[period].find((item) => item.id === id);
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
  next[period] = next[period].filter((todo) => todo.id !== id);
  return next;
}

export function clearCompleted(todos: TodoMap, period: TodoPeriod): TodoMap {
  const next = cloneTodoMap(todos);
  next[period] = next[period].filter((todo) => !todo.done);
  return next;
}

export function removeEmptyTodo(todos: TodoMap, period: TodoPeriod, id: string): TodoMap {
  const todo = todos[period].find((item) => item.id === id);
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
  const next = cloneTodoMap(todos);
  const source = next[sourcePeriod];
  const sourceIndex = source.findIndex((todo) => todo.id === id);
  if (sourceIndex < 0) return next;

  const [todo] = source.splice(sourceIndex, 1);
  const destination = next[destinationPeriod];
  const targetIndex = targetId ? destination.findIndex((item) => item.id === targetId) : -1;
  destination.splice(targetIndex >= 0 ? targetIndex : destination.length, 0, todo);
  return next;
}

export function cloneTodoMap(todos: TodoMap): TodoMap {
  return {
    morning: todos.morning.map((todo) => ({ ...todo })),
    noon: todos.noon.map((todo) => ({ ...todo })),
    evening: todos.evening.map((todo) => ({ ...todo })),
  };
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
